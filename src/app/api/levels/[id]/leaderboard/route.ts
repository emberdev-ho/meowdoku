import { isValidLevelId } from "@/lib/config";
import { currentUser } from "@/lib/server/auth";
import { ApiError, intParam, route } from "@/lib/server/http";
import { levelRank, levelTop } from "@/lib/server/leaderboard";

export const GET = route(async (_req, ctx) => {
  const id = intParam((await ctx.params).id);
  if (!isValidLevelId(id)) throw new ApiError(404, "Không có màn này.");
  const user = await currentUser();
  const [top, me] = await Promise.all([levelTop(id, 10), user ? levelRank(id, user._id.toHexString()) : null]);
  return { top, me };
});
