import { requireUser } from "@/lib/server/auth";
import { ApiError, intParam, readJson, route } from "@/lib/server/http";
import { getLevel } from "@/lib/server/levels";
import { signPlayToken, verifyPlayToken } from "@/lib/server/play-token";

// Gợi ý: ưu tiên sửa ô đang sai, nếu không có thì điền một ô trống ngẫu nhiên.
// Số gợi ý được cộng vào vé chơi mới, nên ảnh hưởng tới số sao khi nộp.
export const POST = route(async (req, ctx) => {
  const user = await requireUser();
  const id = intParam((await ctx.params).id);
  const body = await readJson<{ token?: unknown; board?: unknown }>(req);
  const claims = await verifyPlayToken(body.token, user._id.toHexString(), id);
  const level = await getLevel(id);
  const board = typeof body.board === "string" && body.board.length === level.solution.length ? body.board : level.grid;

  const wrong: number[] = [];
  const empty: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === "0") empty.push(i);
    else if (board[i] !== level.solution[i]) wrong.push(i);
  }
  const pool = wrong.length ? wrong : empty;
  if (pool.length === 0) throw new ApiError(400, "Bàn đã đầy, không cần gợi ý.");
  const idx = pool[Math.floor(Math.random() * pool.length)];
  const token = await signPlayToken({ ...claims, hints: claims.hints + 1 });
  return { idx, value: Number(level.solution[idx]), hints: claims.hints + 1, token };
});
