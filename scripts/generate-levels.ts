// Sinh toàn bộ màn chơi ra JSON. Chạy: npm run levels:generate
//
// Kết quả:
//   public/levels/chunk-XXX.json  -> gửi cho client, CHỈ có đề
//   data/levels/chunk-XXX.json    -> server dùng, có cả đáp án
//   data/rooms.json               -> kho đề riêng cho PvP và co-op
//
// Dùng seed cố định nên chạy lại vẫn ra đúng bộ màn cũ. Đổi SEED hoặc luật
// phân bổ sẽ làm thay đổi màn, khi đó nên tăng PACK_VERSION.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHUNK_COUNT, CHUNK_SIZE, LEVEL_BANDS, LEVEL_COUNT, chunkFile } from "../src/lib/config";
import { generatePuzzle, gridToString, mulberry32 } from "../src/lib/sudoku";

const SEED = 20261015;
const PACK_VERSION = 1;
const ROOT = process.cwd();

type Band = { from: number; to: number; size: 4 | 6 | 9; givensStart: number; givensEnd: number };

// Độ khó tăng dần trong mỗi dải: bắt đầu nhiều ô gợi ý, kết thúc ít ô gợi ý.
const GIVENS: Record<number, [number, number]> = { 4: [8, 5], 6: [20, 11], 9: [38, 24] };
const BANDS: Band[] = LEVEL_BANDS.map((b) => ({
  ...b,
  givensStart: GIVENS[b.size][0],
  givensEnd: GIVENS[b.size][1],
}));

function planFor(id: number) {
  const band = BANDS.find((b) => id >= b.from && id <= b.to)!;
  const t = (id - band.from) / Math.max(1, band.to - band.from);
  const givens = Math.round(band.givensStart + (band.givensEnd - band.givensStart) * t);
  const diff = Math.min(10, 1 + Math.floor(((id - 1) / LEVEL_COUNT) * 10));
  return { size: band.size, givens, diff };
}

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

const publicDir = join(ROOT, "public", "levels");
const dataDir = join(ROOT, "data", "levels");
ensureDir(publicDir);
ensureDir(dataDir);

const t0 = Date.now();
for (let chunk = 0; chunk < CHUNK_COUNT; chunk++) {
  const pub: object[] = [];
  const priv: object[] = [];
  for (let id = chunk * CHUNK_SIZE + 1; id <= Math.min(LEVEL_COUNT, (chunk + 1) * CHUNK_SIZE); id++) {
    const { size, givens, diff } = planFor(id);
    const rng = mulberry32(SEED ^ Math.imul(id, 2654435761));
    const { puzzle, solution } = generatePuzzle(size, givens, rng);
    const grid = gridToString(puzzle);
    pub.push({ id, size, diff, grid });
    priv.push({ id, size, diff, grid, solution: gridToString(solution) });
  }
  const meta = { v: PACK_VERSION, chunk };
  writeFileSync(join(publicDir, chunkFile(chunk)), JSON.stringify({ ...meta, levels: pub }));
  writeFileSync(join(dataDir, chunkFile(chunk)), JSON.stringify({ ...meta, levels: priv }));
  process.stdout.write(`\rĐã sinh gói ${chunk + 1}/${CHUNK_COUNT}`);
}

function pool(prefix: string, count: number, givens: number, seed: number) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const rng = mulberry32(seed ^ Math.imul(i, 2246822519));
    const { puzzle, solution } = generatePuzzle(9, givens, rng);
    out.push({
      id: `${prefix}_${String(i).padStart(4, "0")}`,
      size: 9,
      grid: gridToString(puzzle),
      solution: gridToString(solution),
    });
  }
  return out;
}

// Đề PvP dễ hơn một chút để trận đấu không kéo quá dài; co-op khó hơn vì có nhiều người.
const rooms = {
  v: PACK_VERSION,
  pvp: pool("pvp", 300, 34, SEED + 1),
  coop: pool("coop", 200, 27, SEED + 2),
};
writeFileSync(join(ROOT, "data", "rooms.json"), JSON.stringify(rooms));

console.log(`\nXong sau ${((Date.now() - t0) / 1000).toFixed(1)}s`);
