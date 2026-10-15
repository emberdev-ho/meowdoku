import { publicUser, requireUser } from "@/lib/server/auth";
import { ApiError, readJson, route } from "@/lib/server/http";
import { setDisplayName } from "@/lib/server/leaderboard";
import { collections } from "@/lib/server/mongo";

export const GET = route(async () => publicUser(await requireUser()));

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const { name } = await readJson<{ name?: unknown }>(req);
  const clean = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (clean.length < 2 || clean.length > 20) throw new ApiError(400, "Tên cần từ 2 đến 20 ký tự.");
  const { users } = await collections();
  await users.updateOne({ _id: user._id }, { $set: { name: clean } });
  await setDisplayName(user._id.toHexString(), clean);
  return publicUser({ ...user, name: clean });
});
