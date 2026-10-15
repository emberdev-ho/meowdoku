import { requireUser } from "@/lib/server/auth";
import { ApiError, intParam, readJson, route } from "@/lib/server/http";
import { getLevel, readCats } from "@/lib/server/levels";
import { signPlayToken, verifyPlayToken } from "@/lib/server/play-token";

// Gợi ý: nếu có con mèo đặt sai chỗ thì chỉ ra con đó để gỡ, nếu không thì đặt
// giúp một con mèo đúng. Số gợi ý được cộng vào vé chơi mới, nên ảnh hưởng tới số sao.
export const POST = route(async (req, ctx) => {
  const user = await requireUser();
  const id = intParam((await ctx.params).id);
  const body = await readJson<{ token?: unknown; cats?: unknown }>(req);
  const claims = await verifyPlayToken(body.token, user._id.toHexString(), id);
  const level = await getLevel(id);
  const cats = readCats(body.cats ?? [], level.size);

  const solution = new Set(level.solution);
  const wrong = cats.filter((c) => !solution.has(c));
  const missing = level.solution.filter((c) => !cats.includes(c));
  if (wrong.length === 0 && missing.length === 0) throw new ApiError(400, "Bàn đã giải xong, không cần gợi ý.");

  const token = await signPlayToken({ ...claims, hints: claims.hints + 1 });
  const pick = (xs: number[]) => xs[Math.floor(Math.random() * xs.length)];
  return wrong.length
    ? { kind: "remove" as const, idx: pick(wrong), hints: claims.hints + 1, token }
    : { kind: "place" as const, idx: pick(missing), hints: claims.hints + 1, token };
});
