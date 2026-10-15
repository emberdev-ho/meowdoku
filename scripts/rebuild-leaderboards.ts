// Dựng lại toàn bộ bảng xếp hạng trên Redis từ MongoDB.
// Dùng khi Redis mất dữ liệu hoặc khi đổi sang Redis mới: npm run lb:rebuild
import "./env";
import { MongoClient } from "mongodb";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)!,
  token: (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)!,
  automaticDeserialization: false,
});
const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db(process.env.MONGODB_DB || "meowdoku");

let n = 0;
let pipe = redis.pipeline();
const flush = async () => {
  if (n > 0) await pipe.exec();
  pipe = redis.pipeline();
  n = 0;
};
const push = async (fn: () => void) => {
  fn();
  if (++n >= 500) await flush();
};

for await (const u of db.collection("users").find({}, { projection: { name: 1, totalStars: 1, pvpRating: 1, pvpWins: 1, pvpLosses: 1, pvpDraws: 1 } })) {
  const id = u._id.toHexString();
  await push(() => pipe.hset("names", { [id]: u.name }));
  if (u.totalStars > 0) await push(() => pipe.zadd("lb:global", { score: u.totalStars, member: id }));
  if (u.pvpWins + u.pvpLosses + u.pvpDraws > 0) await push(() => pipe.zadd("lb:pvp", { score: u.pvpRating, member: id }));
}
for await (const r of db.collection("results").find({}, { projection: { userId: 1, levelId: 1, bestTime: 1 } })) {
  await push(() => pipe.zadd(`lb:level:${r.levelId}`, { score: r.bestTime, member: r.userId.toHexString() }));
}
await flush();
console.log("Đã dựng lại bảng xếp hạng.");
await client.close();
