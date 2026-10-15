// Lõi logic của Meowdoku, dùng chung cho client, server và script sinh màn.
//
// Bàn N×N chia thành N vùng màu. Lời giải là N con mèo sao cho mỗi hàng, mỗi cột
// và mỗi vùng có đúng một con, và không có hai con nào đứng sát nhau (kể cả chéo).
// Ô được đánh số idx = hàng * N + cột. Vùng được mã hóa thành chuỗi dài N*N, mỗi
// ký tự là số thứ tự vùng theo hệ 36 ("0".."9", "a"...).

export function parseRegions(s: string): number[] {
  return Array.from(s, (ch) => parseInt(ch, 36));
}

export function regionsToString(regions: number[]): string {
  return regions.map((g) => g.toString(36)).join("");
}

export function touching(size: number, a: number, b: number): boolean {
  if (a === b) return false;
  return Math.abs(Math.floor(a / size) - Math.floor(b / size)) <= 1 && Math.abs((a % size) - (b % size)) <= 1;
}

/** Hai ô có cùng hàng, cùng cột, cùng vùng hoặc đứng sát nhau: không thể cùng có mèo. */
export function clashes(size: number, regions: number[], a: number, b: number): boolean {
  if (a === b) return false;
  return (
    Math.floor(a / size) === Math.floor(b / size) ||
    a % size === b % size ||
    regions[a] === regions[b] ||
    touching(size, a, b)
  );
}

/** Các con mèo đang có xung đột với ít nhất một con khác. */
export function findConflicts(size: number, regions: number[], cats: number[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      if (clashes(size, regions, cats[i], cats[j])) {
        out.add(cats[i]);
        out.add(cats[j]);
      }
    }
  }
  return out;
}

/** Các con mèo đã đặt sẽ xung đột nếu đặt thêm mèo vào ô `idx`. */
export function conflictsWith(size: number, regions: number[], cats: number[], idx: number): number[] {
  return cats.filter((c) => clashes(size, regions, c, idx));
}

export function isSolved(size: number, regions: number[], cats: number[]): boolean {
  return cats.length === size && findConflicts(size, regions, cats).size === 0;
}

// ---------------------------------------------------------------------------
// Đếm lời giải bằng quay lui theo từng hàng (dùng để kiểm tra đề có đúng một lời giải).

export function countSolutions(
  size: number,
  regions: number[],
  given: number[] = [],
  limit = 2,
): { count: number; first: number[] | null } {
  const givenCol = new Array(size).fill(-1);
  for (const g of given) givenCol[Math.floor(g / size)] = g % size;
  const cols = new Array(size).fill(-1);
  let usedCols = 0;
  let usedRegions = 0;
  let count = 0;
  let first: number[] | null = null;

  const rec = (r: number): boolean => {
    if (r === size) {
      count++;
      if (!first) first = cols.map((c, row) => row * size + c);
      return count >= limit;
    }
    const prev = r > 0 ? cols[r - 1] : -9;
    const from = givenCol[r] >= 0 ? givenCol[r] : 0;
    const to = givenCol[r] >= 0 ? givenCol[r] : size - 1;
    for (let c = from; c <= to; c++) {
      const g = regions[r * size + c];
      if (usedCols & (1 << c) || usedRegions & (1 << g) || Math.abs(c - prev) <= 1) continue;
      cols[r] = c;
      usedCols |= 1 << c;
      usedRegions |= 1 << g;
      if (rec(r + 1)) return true;
      usedCols &= ~(1 << c);
      usedRegions &= ~(1 << g);
    }
    cols[r] = -1;
    return false;
  };

  rec(0);
  return { count, first };
}

// ---------------------------------------------------------------------------
// Bộ giải bằng suy luận, mô phỏng cách người chơi nghĩ. Đề hợp lệ phải giải được
// hoàn toàn bằng các kỹ thuật này (không cần đoán), và độ khó tính theo kỹ thuật
// khó nhất phải dùng tới:
//   1. Chỉ còn một ô: một hàng, cột hoặc vùng chỉ còn đúng một ô có thể đặt mèo.
//   2. Vùng nằm gọn trong một hàng/cột (hoặc ngược lại): xóa các ô khác của hàng/cột/vùng đó.
//   3. Chặn: đặt mèo vào một ô sẽ làm một hàng, cột hoặc vùng khác hết chỗ, nên ô đó loại.
//   4. Nhóm k vùng nằm gọn trong k hàng/cột (hoặc ngược lại), với k >= 2.

export type Technique = 1 | 2 | 3 | 4;
export const TECHNIQUE_WEIGHT: Record<Technique, number> = { 1: 0, 2: 1, 3: 2, 4: 4 };

export type LogicResult = {
  solved: boolean;
  cats: number[];
  hardest: Technique;
  /** Tổng trọng số các bước suy luận, dùng để xếp độ khó trong cùng kích thước bàn. */
  score: number;
};

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

type Units = { rows: number[][]; cols: number[][]; regs: number[][]; neighbors: number[][] };

function buildUnits(size: number, regions: number[]): Units {
  const rows: number[][] = Array.from({ length: size }, () => []);
  const cols: number[][] = Array.from({ length: size }, () => []);
  const regs: number[][] = Array.from({ length: size }, () => []);
  const neighbors: number[][] = [];
  for (let i = 0; i < size * size; i++) {
    rows[Math.floor(i / size)].push(i);
    cols[i % size].push(i);
    regs[regions[i]].push(i);
    const r = Math.floor(i / size);
    const c = i % size;
    const ns: number[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < size && cc >= 0 && cc < size) ns.push(rr * size + cc);
      }
    neighbors.push(ns);
  }
  return { rows, cols, regs, neighbors };
}

export function logicSolve(size: number, regions: number[], given: number[] = []): LogicResult {
  const n = size * size;
  const { rows, cols, regs, neighbors } = buildUnits(size, regions);
  const cand = new Array<boolean>(n).fill(true);
  const cats: number[] = [];
  const rowDone = new Array<boolean>(size).fill(false);
  const colDone = new Array<boolean>(size).fill(false);
  const regDone = new Array<boolean>(size).fill(false);
  let hardest: Technique = 1;
  let score = 0;
  const use = (t: Technique) => {
    if (t > hardest) hardest = t;
    score += TECHNIQUE_WEIGHT[t];
  };

  /** Các ô sẽ bị loại nếu đặt mèo vào ô i. */
  const blockedBy = (i: number): number[] => [
    ...rows[Math.floor(i / size)],
    ...cols[i % size],
    ...regs[regions[i]],
    ...neighbors[i],
  ];

  const place = (i: number) => {
    cats.push(i);
    rowDone[Math.floor(i / size)] = true;
    colDone[i % size] = true;
    regDone[regions[i]] = true;
    for (const j of blockedBy(i)) cand[j] = false;
  };

  for (const g of given) place(g);

  const openUnits = (): number[][] => [
    ...rows.filter((_, k) => !rowDone[k]),
    ...cols.filter((_, k) => !colDone[k]),
    ...regs.filter((_, k) => !regDone[k]),
  ];

  // Nhóm k đơn vị (hàng hoặc cột) và k vùng: nếu k vùng nằm gọn trong k hàng thì
  // các ô khác trong k hàng đó không có mèo, và ngược lại.
  const confine = (lines: number[][], lineDone: boolean[], lineOf: (i: number) => number, minK: number, maxK: number): boolean => {
    const openLines = lines.map((_, k) => k).filter((k) => !lineDone[k]);
    const openRegs = regs.map((_, k) => k).filter((k) => !regDone[k]);
    const total = openLines.length;
    if (total <= 1) return false;
    // Bitmask các hàng (cột) mà mỗi vùng còn ô ứng viên, và ngược lại.
    const regLines = new Map<number, number>();
    for (const g of openRegs) {
      let m = 0;
      for (const i of regs[g]) if (cand[i]) m |= 1 << lineOf(i);
      regLines.set(g, m);
    }
    const lineRegs = new Map<number, number>();
    for (const l of openLines) {
      let m = 0;
      for (const i of lines[l]) if (cand[i]) m |= 1 << regions[i];
      lineRegs.set(l, m);
    }
    for (let k = minK; k <= Math.min(maxK, total - 1); k++) {
      for (const subset of combinations(openLines, k)) {
        const mask = subset.reduce((m, l) => m | (1 << l), 0);
        const inside = openRegs.filter((g) => (regLines.get(g)! & ~mask) === 0);
        if (inside.length === k) {
          const keep = inside.reduce((m, g) => m | (1 << g), 0);
          let changed = false;
          for (const l of subset)
            for (const i of lines[l])
              if (cand[i] && !(keep & (1 << regions[i]))) {
                cand[i] = false;
                changed = true;
              }
          if (changed) return true;
        }
      }
      for (const subset of combinations(openRegs, k)) {
        const mask = subset.reduce((m, g) => m | (1 << g), 0);
        const inside = openLines.filter((l) => (lineRegs.get(l)! & ~mask) === 0);
        if (inside.length === k) {
          const keep = inside.reduce((m, l) => m | (1 << l), 0);
          let changed = false;
          for (const g of subset)
            for (const i of regs[g])
              if (cand[i] && !(keep & (1 << lineOf(i)))) {
                cand[i] = false;
                changed = true;
              }
          if (changed) return true;
        }
      }
    }
    return false;
  };

  const rowOfIdx = (i: number) => Math.floor(i / size);
  const colOfIdx = (i: number) => i % size;

  while (cats.length < size) {
    const units = openUnits();
    // Hàng, cột hoặc vùng chưa có mèo mà hết ô ứng viên: đề sai (không xảy ra với đề hợp lệ).
    if (units.some((u) => !u.some((i) => cand[i]))) break;

    // 1. Chỉ còn một ô.
    const single = units.find((u) => u.filter((i) => cand[i]).length === 1);
    if (single) {
      place(single.find((i) => cand[i])!);
      use(1);
      continue;
    }

    // 2. Một vùng nằm gọn trong một hàng/cột, hoặc một hàng/cột nằm gọn trong một vùng.
    if (confine(rows, rowDone, rowOfIdx, 1, 1) || confine(cols, colDone, colOfIdx, 1, 1)) {
      use(2);
      continue;
    }

    // 3. Chặn: đặt mèo ở ô i làm một đơn vị khác hết chỗ.
    let blocked = false;
    for (let i = 0; i < n; i++) {
      if (!cand[i]) continue;
      const gone = new Set(blockedBy(i));
      const kills = units.some((u) => !u.includes(i) && u.every((j) => !cand[j] || gone.has(j)));
      if (kills) {
        cand[i] = false;
        blocked = true;
      }
    }
    if (blocked) {
      use(3);
      continue;
    }

    // 4. Nhóm k vùng nằm gọn trong k hàng/cột.
    if (confine(rows, rowDone, rowOfIdx, 2, size) || confine(cols, colDone, colOfIdx, 2, size)) {
      use(4);
      continue;
    }

    break; // Bí: cần đoán mới đi tiếp được.
  }

  return { solved: cats.length === size && isSolved(size, regions, cats), cats: cats.sort((a, b) => a - b), hardest, score };
}

function* combinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    acc.push(items[i]);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
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

/** Vị trí mèo ngẫu nhiên hợp lệ: mỗi hàng, cột một con, hai hàng liền nhau không sát cột. */
export function randomSolution(size: number, rng: () => number): number[] {
  const cols = new Array(size).fill(-1);
  const used = new Array(size).fill(false);
  const rec = (r: number): boolean => {
    if (r === size) return true;
    for (const c of shuffle([...Array(size).keys()], rng)) {
      if (used[c] || (r > 0 && Math.abs(c - cols[r - 1]) <= 1)) continue;
      cols[r] = c;
      used[c] = true;
      if (rec(r + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  if (!rec(0)) throw new Error(`Không xếp được mèo cho bàn ${size}×${size}`);
  return cols.map((c, r) => r * size + c);
}

/**
 * Chia bàn thành N vùng liền mạch, mỗi vùng chứa đúng một con mèo của lời giải.
 * Mỗi vùng có "sức lớn" ngẫu nhiên nên kích thước vùng chênh lệch: vùng nhỏ tạo
 * điểm bắt đầu suy luận, vùng lớn uốn lượn tạo độ khó.
 */
export function growRegions(size: number, cats: number[], rng: () => number): number[] {
  const n = size * size;
  const region = new Array<number>(n).fill(-1);
  cats.forEach((cell, g) => (region[cell] = g));
  const weight = cats.map(() => (rng() < 0.35 ? 0.15 + rng() * 0.3 : 0.6 + rng() * 1.6));
  let left = n - size;

  const frontier = (g: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      if (region[i] !== g) continue;
      const r = Math.floor(i / size);
      const c = i % size;
      for (const [rr, cc] of [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ]) {
        if (rr >= 0 && rr < size && cc >= 0 && cc < size && region[rr * size + cc] === -1) out.push(rr * size + cc);
      }
    }
    return out;
  };

  while (left > 0) {
    const options = cats.map((_, g) => ({ g, cells: frontier(g) })).filter((o) => o.cells.length > 0);
    const total = options.reduce((s, o) => s + weight[o.g], 0);
    let pick = rng() * total;
    let chosen = options[options.length - 1];
    for (const o of options) {
      pick -= weight[o.g];
      if (pick <= 0) {
        chosen = o;
        break;
      }
    }
    region[chosen.cells[Math.floor(rng() * chosen.cells.length)]] = chosen.g;
    left--;
  }
  return region;
}

export type GeneratedPuzzle = {
  regions: number[];
  solution: number[];
  given: number[];
  hardest: Technique;
  score: number;
};

/**
 * Sinh một đề giải được hoàn toàn bằng suy luận (nên chắc chắn có đúng một lời giải).
 * `givens` là số mèo cho sẵn (khóa) để màn dễ hơn.
 */
export function generatePuzzle(size: number, rng: () => number, givens = 0): GeneratedPuzzle {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const solution = randomSolution(size, rng).sort((a, b) => a - b);
    const regions = growRegions(size, solution, rng);
    if (givens === 0) {
      const res = logicSolve(size, regions);
      if (res.solved) return { regions, solution, given: [], hardest: res.hardest, score: res.score };
      continue;
    }
    for (const g of shuffle(solution.slice(), rng).slice(0, Math.max(1, size))) {
      const given = [g];
      const res = logicSolve(size, regions, given);
      if (res.solved) return { regions, solution, given, hardest: res.hardest, score: res.score };
    }
  }
  throw new Error(`Không sinh được đề ${size}×${size}`);
}
