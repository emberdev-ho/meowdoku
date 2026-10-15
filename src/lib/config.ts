// Cấu hình dùng chung giữa client và server.
import { GRAVITY_ORDER, type Spec } from "./onet";

export const LEVEL_COUNT = 100;
export const CHUNK_SIZE = 100;
export const CHUNK_COUNT = Math.ceil(LEVEL_COUNT / CHUNK_SIZE);

export function chunkOf(levelId: number): number {
  return Math.floor((levelId - 1) / CHUNK_SIZE);
}

export function isValidLevelId(id: number): boolean {
  return Number.isInteger(id) && id >= 1 && id <= LEVEL_COUNT;
}

/**
 * Cỡ bàn theo dải màn. Mỗi loại mèo xuất hiện 4 lần. Khi thêm màn, chỉ thêm dải mới
 * phía sau; sửa dải đã có sẽ làm đổi bàn của các màn cũ (kỷ lục cũ không còn so được).
 */
export const LEVEL_BANDS = [
  { from: 1, to: 10, rows: 6, cols: 8, kinds: 12 },
  { from: 11, to: 30, rows: 8, cols: 12, kinds: 24 },
  { from: 31, to: 100, rows: 9, cols: 16, kinds: 36 },
] as const;

const SEED = 20261016;

/** Đề của một màn: cỡ bàn, kiểu dồn (xoay vòng theo màn) và seed cố định. */
export function levelSpec(id: number): Spec {
  const band = LEVEL_BANDS.find((b) => id >= b.from && id <= b.to) ?? LEVEL_BANDS[LEVEL_BANDS.length - 1];
  return {
    rows: band.rows,
    cols: band.cols,
    kinds: band.kinds,
    gravity: GRAVITY_ORDER[(id - 1) % GRAVITY_ORDER.length],
    seed: (SEED ^ Math.imul(id, 2654435761)) >>> 0,
  };
}

/** Giới hạn thời gian của màn: từ 10 giây mỗi cặp ở màn 1 giảm dần còn 5 giây ở màn cuối. */
export function timeLimitMs(id: number): number {
  const spec = levelSpec(id);
  const pairs = (spec.rows * spec.cols) / 2;
  const perPair = 10 - (5 * (id - 1)) / Math.max(1, LEVEL_COUNT - 1);
  return Math.round(pairs * perPair) * 1000;
}

/** Chơi đơn: số lần gợi ý và số lần tự bấm trộn bàn mỗi màn. */
export const SOLO = { hints: 3, shuffles: 3 } as const;

/** Thời gian tối thiểu hợp lý (mỗi cặp ít nhất 0,25 giây), nhanh hơn coi như gian lận. */
export function minTimeMs(pairs: number): number {
  return pairs * 250;
}

/** Sao theo thời gian còn lại: còn từ một nửa trở lên được 3 sao, từ một phần tư được 2 sao. */
export function computeStars(timeMs: number, limitMs: number): 1 | 2 | 3 {
  const left = 1 - timeMs / limitMs;
  if (left >= 0.5) return 3;
  if (left >= 0.25) return 2;
  return 1;
}

export const PVP = {
  startRating: 1000,
  countdownMs: 3000,
  maxDurationMs: 6 * 60 * 1000,
  forfeitAfterMs: 25_000,
  eloK: 32,
  board: { rows: 8, cols: 12, kinds: 24 },
} as const;

export const COOP = {
  maxPlayers: 4,
  countdownMs: 3000,
  maxDurationMs: 10 * 60 * 1000,
  board: { rows: 9, cols: 16, kinds: 36 },
} as const;

export const ROOM_TTL_SECONDS = 2 * 60 * 60;
