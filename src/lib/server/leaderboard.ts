// Bảng xếp hạng trên Redis sorted set. MongoDB vẫn là nguồn dữ liệu gốc:
// nếu Redis mất dữ liệu, chạy `npm run lb:rebuild` để dựng lại.
import { hmget, pairs, redis } from "./redis";

export const KEYS = {
  level: (id: number) => `lb:level:${id}`, // score = thời gian (ms), thấp hơn là tốt hơn
  global: "lb:global", // score = tổng sao
  pvp: "lb:pvp", // score = rating
  names: "names", // hash userId -> tên hiển thị
};

export type Entry = { rank: number; userId: string; name: string; score: number };

export async function setDisplayName(userId: string, name: string) {
  await redis().hset(KEYS.names, { [userId]: name });
}

async function attachNames(rows: { member: string; score: number }[], startRank: number): Promise<Entry[]> {
  if (rows.length === 0) return [];
  const names = await hmget(KEYS.names, rows.map((r) => r.member));
  return rows.map((r, i) => ({
    rank: startRank + i,
    userId: r.member,
    name: names[r.member] ?? "Mèo ẩn danh",
    score: r.score,
  }));
}

async function top(key: string, n: number, desc: boolean): Promise<Entry[]> {
  const flat = await redis().zrange<string[]>(key, 0, n - 1, { withScores: true, rev: desc });
  return attachNames(pairs(flat), 1);
}

async function rankOf(key: string, userId: string, desc: boolean) {
  const r = redis().pipeline();
  if (desc) r.zrevrank(key, userId);
  else r.zrank(key, userId);
  r.zscore(key, userId);
  const [rank, score] = (await r.exec()) as [number | null, string | number | null];
  if (rank === null || rank === undefined || score === null) return null;
  return { rank: Number(rank) + 1, score: Number(score) };
}

// ---- Theo từng màn (thời gian nhanh nhất) ----

export async function recordLevel(levelId: number, userId: string, timeMs: number, starsGained: number) {
  const p = redis().pipeline();
  // LT: chỉ ghi nếu thời gian mới nhanh hơn kỷ lục cũ của người này.
  p.zadd(KEYS.level(levelId), { lt: true }, { score: timeMs, member: userId });
  if (starsGained > 0) p.zincrby(KEYS.global, starsGained, userId);
  await p.exec();
}

export const levelTop = (levelId: number, n = 10) => top(KEYS.level(levelId), n, false);
export const levelRank = (levelId: number, userId: string) => rankOf(KEYS.level(levelId), userId, false);

// ---- Toàn cục (tổng sao) ----

export const globalTop = (n = 100) => top(KEYS.global, n, true);
export const globalRank = (userId: string) => rankOf(KEYS.global, userId, true);

// ---- PvP (rating) ----

export async function setPvpRating(entries: { userId: string; rating: number }[]) {
  if (entries.length === 0) return;
  const [first, ...rest] = entries.map((e) => ({ score: e.rating, member: e.userId }));
  await redis().zadd(KEYS.pvp, first, ...rest);
}

export const pvpTop = (n = 100) => top(KEYS.pvp, n, true);
export const pvpRank = (userId: string) => rankOf(KEYS.pvp, userId, true);
