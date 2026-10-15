import { requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { leaveQueue, pollQueue } from "@/lib/server/matchmaking";

// Gọi lặp lại khi đang tìm trận. Lần đầu gọi là vào hàng chờ.
export const POST = route(async () => pollQueue(await requireUser()));

export const DELETE = route(async () => {
  const user = await requireUser();
  await leaveQueue(user._id.toHexString());
  return { ok: true };
});
