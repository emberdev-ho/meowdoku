import { requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { joinByCode } from "@/lib/server/rooms";

export const POST = route(async (req) => {
  const user = await requireUser();
  const { code } = await readJson<{ code?: unknown }>(req);
  return { id: await joinByCode(String(code ?? ""), user) };
});
