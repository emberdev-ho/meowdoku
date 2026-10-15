import { requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { makeMove } from "@/lib/server/rooms";

export const POST = route(async (req, ctx) => {
  const user = await requireUser();
  const { idx } = await readJson<{ idx?: unknown }>(req);
  return makeMove((await ctx.params).id, user._id.toHexString(), Number(idx));
});
