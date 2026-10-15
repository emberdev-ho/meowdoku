import { requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { createRoom } from "@/lib/server/rooms";

// Tạo phòng co-op, người tạo là chủ phòng.
export const POST = route(async () => {
  const user = await requireUser();
  const uid = user._id.toHexString();
  const id = await createRoom({
    mode: "coop",
    host: uid,
    startNow: false,
    players: [{ uid, name: user.name, rating: user.pvpRating }],
  });
  return { id };
});
