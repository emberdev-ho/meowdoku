// Lõi logic game nối mèo (kiểu nối ô cổ điển), dùng chung cho client và server.
//
// Bàn rows × cols, mỗi ô là một loại mèo (1..kinds) hoặc 0 khi đã trống. Ô được
// đánh số idx = hàng * cols + cột. Hai ô cùng loại nối được nếu có đường đi qua
// các ô trống và rẽ tối đa 2 lần; đường đi được vòng ra ngoài viền bàn. Nối xong
// hai ô biến mất, các ô còn lại dồn theo kiểu dồn của màn. Bàn hết nước đi thì tự
// trộn. Mọi bước ngẫu nhiên đều theo seed, nên server chơi lại được từng nước.

export type Gravity = "none" | "down" | "up" | "left" | "right" | "splitH" | "joinH" | "splitV" | "joinV";

export const GRAVITY_ORDER: Gravity[] = ["none", "down", "up", "left", "right", "splitH", "joinH", "splitV", "joinV"];

export const GRAVITY_LABEL: Record<Gravity, string> = {
  none: "Đứng yên",
  down: "Dồn xuống",
  up: "Dồn lên",
  left: "Dồn trái",
  right: "Dồn phải",
  splitH: "Tách sang hai bên",
  joinH: "Dồn vào giữa theo hàng",
  splitV: "Tách lên và xuống",
  joinV: "Dồn vào giữa theo cột",
};

export type Spec = { rows: number; cols: number; kinds: number; gravity: Gravity; seed: number };

/** Trạng thái bàn: ô và số lần đã trộn (dùng làm seed cho lần trộn tiếp theo). */
export type GameState = { cells: number[]; shuffles: number };

/** Điểm trên đường nối: [hàng, cột], tính cả viền ảo nên chạy từ -1 tới rows/cols. */
export type Point = [number, number];

/** Nước đi: cặp ô được nối, hoặc [-1, -1] là bấm nút trộn. */
export type Move = [number, number];
export const SHUFFLE_MOVE: Move = [-1, -1];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Tìm đường nối

const DIRS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Đường nối hai ô (tối đa 2 lần rẽ), trả về các điểm đầu, góc rẽ và cuối; null nếu
 * không nối được. Dùng BFS 0-1 trên bàn có thêm một vòng viền trống bao quanh.
 */
export function findPath(cells: number[], rows: number, cols: number, a: number, b: number): Point[] | null {
  if (a === b || !cells[a] || cells[a] !== cells[b]) return null;
  const R = rows + 2;
  const C = cols + 2;
  const pad = (i: number) => (Math.floor(i / cols) + 1) * C + (i % cols) + 1;
  const start = pad(a);
  const goal = pad(b);
  const open = (p: number) => {
    const r = Math.floor(p / C);
    const c = p % C;
    if (r === 0 || c === 0 || r === R - 1 || c === C - 1) return true;
    return cells[(r - 1) * cols + (c - 1)] === 0;
  };

  type Node = { p: number; d: number; t: number; prev: Node | null };
  const best = new Int8Array(R * C * 4).fill(3);
  const deque: Node[] = [];
  const root: Node = { p: start, d: -1, t: 0, prev: null };
  let found: Node | null = null;

  const step = (from: Node, d: number, t: number): boolean => {
    const r = Math.floor(from.p / C) + DIRS[d][0];
    const c = (from.p % C) + DIRS[d][1];
    if (r < 0 || c < 0 || r >= R || c >= C) return false;
    const q = r * C + c;
    const node: Node = { p: q, d, t, prev: from };
    if (q === goal) {
      found = node;
      return true;
    }
    if (!open(q) || best[q * 4 + d] <= t) return false;
    best[q * 4 + d] = t;
    // Đi thẳng không tốn lượt rẽ: đưa lên đầu hàng đợi (BFS 0-1).
    if (from.d === d || from.d === -1) deque.unshift(node);
    else deque.push(node);
    return false;
  };

  for (let d = 0; d < 4; d++) if (step(root, d, 0)) break;
  while (!found && deque.length) {
    const node = deque.shift()!;
    for (let d = 0; d < 4 && !found; d++) {
      const t = node.t + (d === node.d ? 0 : 1);
      if (t <= 2) step(node, d, t);
    }
  }
  // `found` được gán trong hàm step nên TypeScript không tự suy ra kiểu ở đây.
  const end = found as Node | null;
  if (!end) return null;

  // Ghi lại điểm đầu, các góc rẽ và điểm cuối (đổi về tọa độ bàn thật, viền là -1 hoặc rows/cols).
  const nodes: Node[] = [];
  for (let n: Node | null = end; n; n = n.prev) nodes.unshift(n);
  const toPoint = (p: number): Point => [Math.floor(p / C) - 1, (p % C) - 1];
  const points: Point[] = [toPoint(nodes[0].p)];
  for (let i = 1; i < nodes.length - 1; i++) if (nodes[i + 1].d !== nodes[i].d) points.push(toPoint(nodes[i].p));
  points.push(toPoint(nodes[nodes.length - 1].p));
  return points;
}

/** Một cặp nối được bất kỳ (dùng cho gợi ý và để biết bàn còn nước đi không). */
export function findMove(cells: number[], rows: number, cols: number): Move | null {
  const byKind = new Map<number, number[]>();
  cells.forEach((k, i) => {
    if (!k) return;
    const list = byKind.get(k);
    if (list) list.push(i);
    else byKind.set(k, [i]);
  });
  for (const list of byKind.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) if (findPath(cells, rows, cols, list[i], list[j])) return [list[i], list[j]];
  return null;
}

// ---------------------------------------------------------------------------
// Dồn ô

/** Dồn các ô khác 0 trong danh sách vị trí về phía phần tử đầu tiên. */
function compact(cells: number[], idxs: number[]) {
  const vals = idxs.map((i) => cells[i]).filter((v) => v !== 0);
  idxs.forEach((i, k) => (cells[i] = vals[k] ?? 0));
}

const range = (from: number, to: number) => {
  const out: number[] = [];
  if (from <= to) for (let i = from; i <= to; i++) out.push(i);
  else for (let i = from; i >= to; i--) out.push(i);
  return out;
};

export function applyGravity(cells: number[], rows: number, cols: number, g: Gravity): number[] {
  const out = cells.slice();
  if (g === "none") return out;
  const col = (c: number, rs: number[]) => rs.map((r) => r * cols + c);
  const row = (r: number, cs: number[]) => cs.map((c) => r * cols + c);
  const hr = Math.floor(rows / 2);
  const hc = Math.floor(cols / 2);
  for (let c = 0; c < cols; c++) {
    if (g === "down") compact(out, col(c, range(rows - 1, 0)));
    if (g === "up") compact(out, col(c, range(0, rows - 1)));
    if (g === "splitV") {
      compact(out, col(c, range(0, hr - 1)));
      compact(out, col(c, range(rows - 1, hr)));
    }
    if (g === "joinV") {
      compact(out, col(c, range(hr - 1, 0)));
      compact(out, col(c, range(hr, rows - 1)));
    }
  }
  for (let r = 0; r < rows; r++) {
    if (g === "right") compact(out, row(r, range(cols - 1, 0)));
    if (g === "left") compact(out, row(r, range(0, cols - 1)));
    if (g === "splitH") {
      compact(out, row(r, range(0, hc - 1)));
      compact(out, row(r, range(cols - 1, hc)));
    }
    if (g === "joinH") {
      compact(out, row(r, range(hc - 1, 0)));
      compact(out, row(r, range(hc, cols - 1)));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sinh bàn, trộn, chơi một nước, chơi lại cả ván

/** Trộn các ô còn lại (giữ nguyên vị trí trống) cho tới khi có nước đi. */
function reshuffle(spec: Spec, cells: number[], shuffles: number): number[] {
  const rng = mulberry32((spec.seed + Math.imul(shuffles + 1, 7919)) >>> 0);
  const spots = cells.flatMap((k, i) => (k ? [i] : []));
  const out = cells.slice();
  for (let attempt = 0; attempt < 500; attempt++) {
    const kinds = shuffleInPlace(spots.map((i) => cells[i]), rng);
    spots.forEach((i, k) => (out[i] = kinds[k]));
    if (spots.length === 0 || findMove(out, spec.rows, spec.cols)) break;
  }
  return out;
}

export function initialState(spec: Spec): GameState {
  const n = spec.rows * spec.cols;
  const each = n / spec.kinds;
  if (!Number.isInteger(each) || each % 2 !== 0) throw new Error("Số ô phải chia hết cho số loại mèo và mỗi loại có số chẵn ô");
  const tiles: number[] = [];
  for (let k = 1; k <= spec.kinds; k++) for (let j = 0; j < each; j++) tiles.push(k);
  shuffleInPlace(tiles, mulberry32(spec.seed));
  const cells = findMove(tiles, spec.rows, spec.cols) ? tiles : reshuffle(spec, tiles, -1);
  return { cells, shuffles: 0 };
}

export const remaining = (s: GameState) => s.cells.reduce((n, k) => n + (k ? 1 : 0), 0);
export const isCleared = (s: GameState) => s.cells.every((k) => k === 0);

export type MoveResult = { ok: false } | { ok: true; path: Point[]; state: GameState; autoShuffled: boolean };

/** Nối ô a với ô b: xóa cặp, dồn ô, và tự trộn nếu bàn hết nước đi. */
export function playMove(spec: Spec, s: GameState, a: number, b: number): MoveResult {
  const path = findPath(s.cells, spec.rows, spec.cols, a, b);
  if (!path) return { ok: false };
  const cleared = s.cells.slice();
  cleared[a] = 0;
  cleared[b] = 0;
  let cells = applyGravity(cleared, spec.rows, spec.cols, spec.gravity);
  let shuffles = s.shuffles;
  let autoShuffled = false;
  if (cells.some((k) => k) && !findMove(cells, spec.rows, spec.cols)) {
    cells = reshuffle(spec, cells, shuffles);
    shuffles++;
    autoShuffled = true;
  }
  return { ok: true, path, state: { cells, shuffles }, autoShuffled };
}

/** Người chơi bấm nút trộn. */
export function shuffleBoard(spec: Spec, s: GameState): GameState {
  return { cells: reshuffle(spec, s.cells, s.shuffles), shuffles: s.shuffles + 1 };
}

/** Chơi lại toàn bộ nước đi từ đầu (server dùng để kiểm tra kết quả). */
export function replay(spec: Spec, moves: Move[]): { ok: boolean; state: GameState; manualShuffles: number } {
  let state = initialState(spec);
  let manualShuffles = 0;
  for (const [a, b] of moves) {
    if (a === -1 && b === -1) {
      state = shuffleBoard(spec, state);
      manualShuffles++;
      continue;
    }
    const res = playMove(spec, state, a, b);
    if (!res.ok) return { ok: false, state, manualShuffles };
    state = res.state;
  }
  return { ok: true, state, manualShuffles };
}

// ---------------------------------------------------------------------------
// Mã hóa bàn thành chuỗi để lưu Redis: "." là ô trống, loại 1..36 là "0".."z".

export function encodeState(s: GameState): string {
  return `${s.shuffles}|${s.cells.map((k) => (k ? (k - 1).toString(36) : ".")).join("")}`;
}

export function decodeState(raw: string): GameState {
  const [shuffles, board] = raw.split("|");
  return { shuffles: Number(shuffles), cells: Array.from(board, (ch) => (ch === "." ? 0 : parseInt(ch, 36) + 1)) };
}
