import { requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { startRoom } from "@/lib/server/rooms";

export const POST = route(async (_req, ctx) => {
  const user = await requireUser();
  await startRoom((await ctx.params).id, user._id.toHexString());
  return { ok: true };
});
