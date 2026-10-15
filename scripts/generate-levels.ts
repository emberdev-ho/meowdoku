// Sinh toàn bộ màn chơi ra JSON. Chạy: npm run levels:generate
//
// Kết quả:
//   public/levels/chunk-XXX.json  -> gửi cho client, CHỈ có đề (vùng màu và mèo cho sẵn)
//   data/levels/chunk-XXX.json    -> server dùng, có cả lời giải
//   data/rooms.json               -> kho đề riêng cho PvP và co-op
//
// Dùng seed cố định và mỗi màn chỉ phụ thuộc vào số thứ tự của nó, nên chạy lại
// vẫn ra đúng bộ màn cũ, kể cả khi tăng LEVEL_COUNT để thêm màn. Đổi SEED, luật
// sinh hoặc các dải đã có sẽ làm thay đổi màn, khi đó phải tăng PACK_VERSION.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHUNK_COUNT, CHUNK_SIZE, LEVEL_BANDS, LEVEL_COUNT, chunkFile, givensForLevel } from "../src/lib/config";
import { countSolutions, generatePuzzle, mulberry32, regionsToString, type GeneratedPuzzle } from "../src/lib/puzzle";

const SEED = 20261016;
const PACK_VERSION = 2;
const ROOT = process.cwd();
// Số đề ứng viên cho mỗi màn. Đầu dải chọn đề dễ nhất, cuối dải chọn đề khó nhất.
const CANDIDATES = 8;

const difficulty = (p: GeneratedPuzzle) => p.hardest * 1000 + p.score;

function check(size: number, p: GeneratedPuzzle, label: string) {
  const { count, first } = countSolutions(size, p.regions, p.given);
  if (count !== 1 || first!.join() !== p.solution.join()) throw new Error(`${label}: đề không có đúng một lời giải`);
}

function planFor(id: number) {
  const band = LEVEL_BANDS.find((b) => id >= b.from && id <= b.to);
  if (!band) throw new Error(`Màn ${id} chưa thuộc dải nào trong LEVEL_BANDS`);
  const t = (id - band.from) / Math.max(1, band.to - band.from);
  return { size: band.size, t, givens: givensForLevel(id) };
}

const seen = new Set<string>();

function makeLevel(id: number) {
  const { size, t, givens } = planFor(id);
  const rng = mulberry32(SEED ^ Math.imul(id, 2654435761));
  const pool: GeneratedPuzzle[] = [];
  while (pool.length < CANDIDATES) {
    const p = generatePuzzle(size, rng, givens);
    if (!seen.has(regionsToString(p.regions))) pool.push(p);
  }
  pool.sort((a, b) => difficulty(a) - difficulty(b));
  const p = pool[Math.round(t * (CANDIDATES - 1))];
  check(size, p, `Màn ${id}`);
  seen.add(regionsToString(p.regions));
  return { id, size, diff: p.hardest, regions: regionsToString(p.regions), given: p.given, solution: p.solution };
}

const publicDir = join(ROOT, "public", "levels");
const dataDir = join(ROOT, "data", "levels");
for (const dir of [publicDir, dataDir]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const t0 = Date.now();
for (let chunk = 0; chunk < CHUNK_COUNT; chunk++) {
  const pub: object[] = [];
  const priv: object[] = [];
  for (let id = chunk * CHUNK_SIZE + 1; id <= Math.min(LEVEL_COUNT, (chunk + 1) * CHUNK_SIZE); id++) {
    const { solution, ...level } = makeLevel(id);
    pub.push(level);
    priv.push({ ...level, solution });
  }
  const meta = { v: PACK_VERSION, chunk };
  writeFileSync(join(publicDir, chunkFile(chunk)), JSON.stringify({ ...meta, levels: pub }));
  writeFileSync(join(dataDir, chunkFile(chunk)), JSON.stringify({ ...meta, levels: priv }));
  process.stdout.write(`\rĐã sinh gói ${chunk + 1}/${CHUNK_COUNT}`);
}

function pool(prefix: string, count: number, size: number, seed: number) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const rng = mulberry32(seed ^ Math.imul(i, 2246822519));
    const p = generatePuzzle(size, rng);
    const id = `${prefix}_${String(i).padStart(4, "0")}`;
    check(size, p, id);
    out.push({ id, size, regions: regionsToString(p.regions), given: p.given, solution: p.solution });
  }
  return out;
}

// PvP dùng bàn 7×7 để trận đấu nhanh; co-op dùng bàn 8×8 vì có nhiều người cùng giải.
const rooms = {
  v: PACK_VERSION,
  pvp: pool("pvp", 150, 7, SEED + 1),
  coop: pool("coop", 80, 8, SEED + 2),
};
writeFileSync(join(ROOT, "data", "rooms.json"), JSON.stringify(rooms));

console.log(`\nXong sau ${((Date.now() - t0) / 1000).toFixed(1)}s`);
