import { CHUNK_COUNT, CHUNK_SIZE } from "@/lib/config";
import { requireUser } from "@/lib/server/auth";
import { ApiError, route } from "@/lib/server/http";
import { collections } from "@/lib/server/mongo";

// Tiến độ theo từng gói 100 màn, để không phải tải cả 3000 kết quả một lần.
export const GET = route(async (req) => {
  const user = await requireUser();
  const chunk = Number(new URL(req.url).searchParams.get("chunk") ?? 0);
  if (!Number.isInteger(chunk) || chunk < 0 || chunk >= CHUNK_COUNT) throw new ApiError(400, "Gói màn không hợp lệ.");
  const { results } = await collections();
  const rows = await results
    .find(
      { userId: user._id, levelId: { $gt: chunk * CHUNK_SIZE, $lte: (chunk + 1) * CHUNK_SIZE } },
      { projection: { _id: 0, levelId: 1, stars: 1, bestTime: 1 } },
    )
    .toArray();
  return { maxLevel: user.maxLevel, results: rows };
});
