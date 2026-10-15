// Lõi logic Sudoku dùng chung cho client, server và script sinh màn.
// Lưới được mã hóa thành mảng số (0 = ô trống) hoặc chuỗi "1020..." dài size*size.

export type Size = 4 | 6 | 9;

/** Kích thước một khối: [số hàng, số cột]. */
export function boxDims(size: number): [number, number] {
  if (size === 4) return [2, 2];
  if (size === 6) return [2, 3];
  return [3, 3];
}

export function boxOf(size: number, r: number, c: number): number {
  const [br, bc] = boxDims(size);
  return Math.floor(r / br) * (size / bc) + Math.floor(c / bc);
}

export function parseGrid(s: string): number[] {
  return Array.from(s, (ch) => ch.charCodeAt(0) - 48);
}

export function gridToString(g: number[]): string {
  return g.join("");
}

/** Trả về tập chỉ số các ô đang trùng giá trị trong hàng, cột hoặc khối. */
export function findConflicts(grid: number[], size: number): Set<number> {
  const out = new Set<number>();
  const groups = new Map<string, number[]>();
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (!v) continue;
    const r = Math.floor(i / size);
    const c = i % size;
    for (const key of [`r${r}:${v}`, `c${c}:${v}`, `b${boxOf(size, r, c)}:${v}`]) {
      const list = groups.get(key);
      if (list) list.push(i);
      else groups.set(key, [i]);
    }
  }
  for (const list of groups.values()) {
    if (list.length > 1) list.forEach((i) => out.add(i));
  }
  return out;
}

export function isComplete(grid: number[], size: number): boolean {
  return grid.every((v) => v > 0) && findConflicts(grid, size).size === 0;
}

// ---------------------------------------------------------------------------
// Bộ giải dùng bitmask + chọn ô ít ứng viên nhất (MRV). Đủ nhanh cho 9x9.

type Geometry = { rowOf: number[]; colOf: number[]; boxOfIdx: number[] };
const geoCache = new Map<number, Geometry>();

function geometry(size: number): Geometry {
  let g = geoCache.get(size);
  if (!g) {
    const n = size * size;
    g = { rowOf: [], colOf: [], boxOfIdx: [] };
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / size);
      const c = i % size;
      g.rowOf.push(r);
      g.colOf.push(c);
      g.boxOfIdx.push(boxOf(size, r, c));
    }
    geoCache.set(size, g);
  }
  return g;
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

export type SolveResult = { count: number; solution: number[] | null };

/**
 * Đếm số lời giải (dừng khi đạt `limit`). Nếu truyền `rng`, thứ tự thử ngẫu nhiên
 * (dùng để sinh lưới đầy đủ).
 */
export function solve(
  input: number[],
  size: number,
  limit = 2,
  rng?: () => number,
): SolveResult {
  const { rowOf, colOf, boxOfIdx } = geometry(size);
  const full = (1 << size) - 1;
  const rows = new Array(size).fill(0);
  const cols = new Array(size).fill(0);
  const boxes = new Array(size).fill(0);
  const cells = input.slice();

  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (!v) continue;
    const bit = 1 << (v - 1);
    if (rows[rowOf[i]] & bit || cols[colOf[i]] & bit || boxes[boxOfIdx[i]] & bit) {
      return { count: 0, solution: null };
    }
    rows[rowOf[i]] |= bit;
    cols[colOf[i]] |= bit;
    boxes[boxOfIdx[i]] |= bit;
  }

  const empties: number[] = [];
  for (let i = 0; i < cells.length; i++) if (!cells[i]) empties.push(i);

  let count = 0;
  let solution: number[] | null = null;

  const rec = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 99;
    for (const i of empties) {
      if (cells[i]) continue;
      const m = full & ~(rows[rowOf[i]] | cols[colOf[i]] | boxes[boxOfIdx[i]]);
      const k = popcount(m);
      if (k === 0) return false;
      if (k < bestCount) {
        best = i;
        bestMask = m;
        bestCount = k;
        if (k === 1) break;
      }
    }
    if (best === -1) {
      count++;
      if (!solution) solution = cells.slice();
      return count >= limit;
    }
    const candidates: number[] = [];
    let m = bestMask;
    while (m) {
      const bit = m & -m;
      m ^= bit;
      candidates.push(bit);
    }
    if (rng) shuffle(candidates, rng);
    const r = rowOf[best];
    const c = colOf[best];
    const b = boxOfIdx[best];
    for (const bit of candidates) {
      cells[best] = 31 - Math.clz32(bit) + 1;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (rec()) return true;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      cells[best] = 0;
    }
    return false;
  };

  rec();
  return { count, solution };
}

// ---------------------------------------------------------------------------
// Sinh đề có seed để mỗi lần chạy script đều ra cùng một bộ màn.

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

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateSolved(size: number, rng: () => number): number[] {
  const empty = new Array(size * size).fill(0);
  const { solution } = solve(empty, size, 1, rng);
  if (!solution) throw new Error("Không sinh được lưới đầy đủ");
  return solution;
}

/**
 * Xóa dần ô theo thứ tự ngẫu nhiên, chỉ giữ lại thao tác xóa nếu đề vẫn có
 * đúng một lời giải. Dừng khi đạt số ô gợi ý mong muốn hoặc không xóa thêm được.
 */
export function generatePuzzle(
  size: number,
  targetGivens: number,
  rng: () => number,
): { puzzle: number[]; solution: number[] } {
  const solution = generateSolved(size, rng);
  const puzzle = solution.slice();
  let givens = puzzle.length;
  const order = shuffle([...puzzle.keys()], rng);
  for (const idx of order) {
    if (givens <= targetGivens) break;
    const keep = puzzle[idx];
    puzzle[idx] = 0;
    if (solve(puzzle, size, 2).count !== 1) puzzle[idx] = keep;
    else givens--;
  }
  return { puzzle, solution };
}
