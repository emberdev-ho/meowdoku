import { computeStars, isValidLevelId, minTimeMs } from "@/lib/config";
import { requireUser } from "@/lib/server/auth";
import { ApiError, intParam, readJson, route } from "@/lib/server/http";
import { levelRank, levelTop, recordLevel } from "@/lib/server/leaderboard";
import { countEmpties, getLevel } from "@/lib/server/levels";
import { collections } from "@/lib/server/mongo";
import { verifyPlayToken } from "@/lib/server/play-token";

export const POST = route(async (req, ctx) => {
  const user = await requireUser();
  const uid = user._id.toHexString();
  const id = intParam((await ctx.params).id);
  const body = await readJson<{ token?: unknown; board?: unknown }>(req);
  const claims = await verifyPlayToken(body.token, uid, id);
  const level = await getLevel(id);

  if (body.board !== level.solution) throw new ApiError(400, "Lời giải chưa đúng.");

  // Thời gian tính theo đồng hồ server, không tin số liệu client gửi lên.
  const timeMs = Date.now() - claims.t0;
  const empties = countEmpties(level.grid);
  if (timeMs < minTimeMs(empties)) throw new ApiError(422, "Thời gian giải không hợp lệ.");
  const stars = computeStars(level.size, empties, timeMs, claims.hints);

  const { results, users } = await collections();
  const now = new Date();
  const before = await results.findOneAndUpdate(
    { userId: user._id, levelId: id },
    {
      $min: { bestTime: timeMs },
      $max: { stars },
      $set: { updatedAt: now },
      $setOnInsert: { completedAt: now, hintsUsed: claims.hints },
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
    hints: claims.hints,
    firstClear,
    newBest: !before || timeMs < before.bestTime,
    bestTime: before ? Math.min(before.bestTime, timeMs) : timeMs,
    rank: rank?.rank ?? null,
    top,
    nextLevel: isValidLevelId(id + 1) ? id + 1 : null,
  };
});
