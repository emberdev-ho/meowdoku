import { currentUser } from "@/lib/server/auth";
import { ApiError, route } from "@/lib/server/http";
import { globalRank, globalTop, pvpRank, pvpTop } from "@/lib/server/leaderboard";

export const GET = route(async (req) => {
  const type = new URL(req.url).searchParams.get("type") ?? "global";
  if (type !== "global" && type !== "pvp") throw new ApiError(400, "Loại bảng xếp hạng không hợp lệ.");
  const user = await currentUser();
  const uid = user?._id.toHexString();
  const [top, me] =
    type === "global"
      ? await Promise.all([globalTop(100), uid ? globalRank(uid) : null])
      : await Promise.all([pvpTop(100), uid ? pvpRank(uid) : null]);
  return { type, top, me };
});
