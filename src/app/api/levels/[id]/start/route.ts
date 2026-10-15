import { isValidLevelId } from "@/lib/config";
import { requireUser } from "@/lib/server/auth";
import { ApiError, intParam, route } from "@/lib/server/http";
import { collections } from "@/lib/server/mongo";
import { signPlayToken } from "@/lib/server/play-token";

// Mở màn: kiểm tra đã mở khóa chưa và cấp vé chơi có ghi giờ bắt đầu.
export const POST = route(async (_req, ctx) => {
  const user = await requireUser();
  const id = intParam((await ctx.params).id);
  if (!isValidLevelId(id)) throw new ApiError(404, "Không có màn này.");
  if (id > user.maxLevel + 1) throw new ApiError(403, `Hãy qua màn ${user.maxLevel + 1} trước.`);
  const uid = user._id.toHexString();
  const { results } = await collections();
  const best = await results.findOne({ userId: user._id, levelId: id }, { projection: { bestTime: 1, stars: 1 } });
  const token = await signPlayToken({ uid, lvl: id, t0: Date.now(), hints: 0 });
  return { token, best: best ? { time: best.bestTime, stars: best.stars } : null };
});
