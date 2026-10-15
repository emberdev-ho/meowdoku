// Cấu hình dùng chung giữa client và server.

export const LEVEL_COUNT = 100;
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

/**
 * Kích thước bàn theo dải màn. Script sinh màn dùng chung cấu hình này.
 * Khi thêm màn, chỉ thêm dải mới phía sau; sửa dải đã có sẽ làm đổi các màn cũ.
 */
export const LEVEL_BANDS = [
  { from: 1, to: 15, size: 5 },
  { from: 16, to: 50, size: 6 },
  { from: 51, to: 100, size: 7 },
] as const;

export function sizeForLevel(id: number): number {
  return LEVEL_BANDS.find((b) => id >= b.from && id <= b.to)?.size ?? LEVEL_BANDS[LEVEL_BANDS.length - 1].size;
}

/** Vài màn đầu có sẵn một con mèo khóa để người mới làm quen. */
export function givensForLevel(id: number): number {
  return id <= 5 ? 1 : 0;
}

/** Chơi đơn: số tim. Mất một tim mỗi lần đặt mèo vi phạm luật. */
export const SOLO = { hearts: 3 } as const;

/** Thời gian chuẩn (giây) theo kích thước bàn, dùng để tính sao. */
const PAR_SECONDS: Record<number, number> = { 5: 40, 6: 60, 7: 90, 8: 120, 9: 160, 10: 210 };

export function parTimeMs(size: number): number {
  return (PAR_SECONDS[size] ?? 210) * 1000;
}

/** Thời gian tối thiểu hợp lý, nhanh hơn mức này coi như gian lận. */
export function minTimeMs(catsToPlace: number): number {
  return catsToPlace * 500;
}

export function computeStars(size: number, timeMs: number, hints: number): 1 | 2 | 3 {
  const par = parTimeMs(size);
  if (hints === 0 && timeMs <= par) return 3;
  if (hints <= 1 && timeMs <= par * 2) return 2;
  return 1;
}

export const PVP = {
  startRating: 1000,
  maxMistakes: 3,
  countdownMs: 3000,
  maxDurationMs: 10 * 60 * 1000,
  forfeitAfterMs: 25_000,
  eloK: 32,
} as const;

export const COOP = {
  maxPlayers: 4,
  maxMistakes: 5,
  countdownMs: 3000,
  maxDurationMs: 20 * 60 * 1000,
} as const;

export const ROOM_TTL_SECONDS = 2 * 60 * 60;
