// Tạo index cho MongoDB. Chạy một lần: npm run db:indexes
import "./env";
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db(process.env.MONGODB_DB || "meowdoku");

await db.collection("results").createIndexes([
  { key: { userId: 1, levelId: 1 }, unique: true },
  { key: { levelId: 1, bestTime: 1 } },
]);
await db.collection("users").createIndexes([{ key: { totalStars: -1 } }, { key: { pvpRating: -1 } }]);
await db.collection("matches").createIndexes([{ key: { "players.userId": 1, endedAt: -1 } }]);

console.log("Đã tạo index.");
await client.close();
