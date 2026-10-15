import { requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { getRoomView } from "@/lib/server/rooms";

// Client gọi mỗi ~1 giây để cập nhật trạng thái phòng.
export const GET = route(async (_req, ctx) => {
  const user = await requireUser();
  return getRoomView((await ctx.params).id, user._id.toHexString());
});
