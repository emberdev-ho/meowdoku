import { requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { leaveRoom } from "@/lib/server/rooms";

export const POST = route(async (_req, ctx) => {
  const user = await requireUser();
  await leaveRoom((await ctx.params).id, user._id.toHexString());
  return { ok: true };
});
