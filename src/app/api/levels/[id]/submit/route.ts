import { SOLO, computeStars, isValidLevelId, levelSpec, minTimeMs, timeLimitMs } from "@/lib/config";
import { isCleared, replay, type Move } from "@/lib/onet";
import { requireUser } from "@/lib/server/auth";
import { ApiError, intParam, readJson, route } from "@/lib/server/http";
import { levelRank, levelTop, recordLevel } from "@/lib/server/leaderboard";
import { collections } from "@/lib/server/mongo";
import { verifyPlayToken } from "@/lib/server/play-token";

/** Danh sách nước đi do client gửi: mỗi nước là cặp ô [a, b] hoặc [-1, -1] (bấm trộn). */
function readMoves(raw: unknown, cells: number): Move[] {
  if (!Array.isArray(raw) || raw.length > cells * 2) throw new ApiError(400, "Danh sách nước đi không hợp lệ.");
  return raw.map((m) => {
    if (!Array.isArray(m) || m.length !== 2) throw new ApiError(400, "Danh sách nước đi không hợp lệ.");
    const [a, b] = m.map(Number);
    const ok = (a === -1 && b === -1) || [a, b].every((x) => Number.isInteger(x) && x >= 0 && x < cells);
    if (!ok) throw new ApiError(400, "Danh sách nước đi không hợp lệ.");
    return [a, b];
  });
}

export const POST = route(async (req, ctx) => {
  const user = await requireUser();
  const uid = user._id.toHexString();
  const id = intParam((await ctx.params).id);
  if (!isValidLevelId(id)) throw new ApiError(404, "Không có màn này.");
  const body = await readJson<{ token?: unknown; moves?: unknown }>(req);
  const claims = await verifyPlayToken(body.token, uid, id);

  // Chơi lại toàn bộ ván từ seed của màn: mọi nước phải hợp lệ và bàn phải sạch.
  const spec = levelSpec(id);
  const moves = readMoves(body.moves, spec.rows * spec.cols);
  const result = replay(spec, moves);
  if (!result.ok || !isCleared(result.state)) throw new ApiError(400, "Ván chơi không hợp lệ.");
  if (result.manualShuffles > SOLO.shuffles) throw new ApiError(400, `Chỉ được trộn bàn ${SOLO.shuffles} lần.`);

  // Thời gian tính theo đồng hồ server, không tin số liệu client gửi lên.
  const timeMs = Date.now() - claims.t0;
  const limitMs = timeLimitMs(id);
  if (timeMs < minTimeMs((spec.rows * spec.cols) / 2)) throw new ApiError(422, "Thời gian giải không hợp lệ.");
  // Cho thêm 5 giây bù độ trễ mạng.
  if (timeMs > limitMs + 5000) throw new ApiError(422, "Đã hết giờ của màn này.");
  const stars = computeStars(Math.min(timeMs, limitMs), limitMs);

  const { results, users } = await collections();
  const now = new Date();
  const before = await results.findOneAndUpdate(
    { userId: user._id, levelId: id },
    {
      $min: { bestTime: timeMs },
      $max: { stars },
      $set: { updatedAt: now },
      $setOnInsert: { completedAt: now, hintsUsed: 0 },
    },
    { upsert: true, returnDocument: "before" },
  );

  const firstClear = !before;
  const starsGained = Math.max(0, stars - (before?.stars ?? 0));
  await users.updateOne(
    { _id: user._id },
    { $inc: { levelsCleared: firstClear ? 1 : 0, totalStars: starsGained }, $max: { maxLevel: id } },
  );
  await recordLevel(id, uid, timeMs, starsGained);

  const [rank, top] = await Promise.all([levelRank(id, uid), levelTop(id, 10)]);
  return {
    timeMs,
    stars,
    firstClear,
    newBest: !before || timeMs < before.bestTime,
    bestTime: before ? Math.min(before.bestTime, timeMs) : timeMs,
    rank: rank?.rank ?? null,
    top,
    nextLevel: isValidLevelId(id + 1) ? id + 1 : null,
  };
});
