// Cấu hình dùng chung giữa client và server.

export const LEVEL_COUNT = 3000;
export const CHUNK_SIZE = 100;
export const CHUNK_COUNT = Math.ceil(LEVEL_COUNT / CHUNK_SIZE);

export function chunkOf(levelId: number): number {
  return Math.floor((levelId - 1) / CHUNK_SIZE);
}

export function chunkFile(chunk: number): string {
  return `chunk-${String(chunk).padStart(3, "0")}.json`;
}

export function isValidLevelId(id: number): boolean {
  return Number.isInteger(id) && id >= 1 && id <= LEVEL_COUNT;
}

/** Thời gian chuẩn (giây) cho mỗi ô trống, dùng để tính sao. */
const PAR_PER_EMPTY: Record<number, number> = { 4: 2.5, 6: 4, 9: 7 };

export function parTimeMs(size: number, empties: number): number {
  return Math.round(empties * (PAR_PER_EMPTY[size] ?? 7) * 1000);
}

/** Thời gian tối thiểu hợp lý, nhanh hơn mức này coi như gian lận. */
export function minTimeMs(empties: number): number {
  return empties * 400;
}

export function computeStars(size: number, empties: number, timeMs: number, hints: number): 1 | 2 | 3 {
  const par = parTimeMs(size, empties);
  if (hints === 0 && timeMs <= par) return 3;
  if (hints <= 1 && timeMs <= par * 2) return 2;
  return 1;
}

export const PVP = {
  startRating: 1000,
  maxMistakes: 3,
  countdownMs: 3000,
  maxDurationMs: 15 * 60 * 1000,
  forfeitAfterMs: 25_000,
  eloK: 32,
} as const;

export const COOP = {
  maxPlayers: 4,
  maxMistakes: 5,
  countdownMs: 3000,
  maxDurationMs: 30 * 60 * 1000,
} as const;

export const ROOM_TTL_SECONDS = 2 * 60 * 60;

/** Kích thước bàn theo dải màn. Script sinh màn dùng chung cấu hình này. */
export const LEVEL_BANDS = [
  { from: 1, to: 100, size: 4 },
  { from: 101, to: 600, size: 6 },
  { from: 601, to: LEVEL_COUNT, size: 9 },
] as const;

export function sizeForLevel(id: number): number {
  return LEVEL_BANDS.find((b) => id >= b.from && id <= b.to)?.size ?? 9;
}
