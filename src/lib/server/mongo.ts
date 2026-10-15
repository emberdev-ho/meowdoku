// Kết nối MongoDB, tái sử dụng client giữa các lần gọi hàm serverless.
import { MongoClient, type Db, type ObjectId } from "mongodb";

export type UserDoc = {
  _id: ObjectId;
  name: string;
  createdAt: Date;
  maxLevel: number; // màn cao nhất đã qua (0 = chưa qua màn nào)
  levelsCleared: number;
  totalStars: number;
  pvpRating: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  coopClears: number;
};

export type ResultDoc = {
  userId: ObjectId;
  levelId: number;
  bestTime: number; // ms
  stars: number;
  hintsUsed: number;
  completedAt: Date;
  updatedAt: Date;
};

export type MatchDoc = {
  roomId: string;
  mode: "pvp" | "coop";
  puzzleId: string;
  players: {
    userId: ObjectId;
    name: string;
    result?: "win" | "lose" | "draw";
    progress: number;
    mistakes?: number;
    ratingBefore?: number;
    ratingAfter?: number;
  }[];
  outcome: string;
  startedAt: Date;
  endedAt: Date;
};

const g = globalThis as unknown as { _mongo?: Promise<MongoClient> };

function clientPromise(): Promise<MongoClient> {
  if (!g._mongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Thiếu biến môi trường MONGODB_URI");
    // Kết nối hỏng thì bỏ cache để request sau thử lại, thay vì lỗi mãi tới khi
    // Vercel khởi động lại hàm. Chờ tối đa 10 giây thay vì 30 giây mặc định.
    g._mongo = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10_000 }).connect().catch((err) => {
      g._mongo = undefined;
      throw err;
    });
  }
  return g._mongo;
}

export async function db(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB || "meowdoku");
}

export async function collections() {
  const d = await db();
  return {
    users: d.collection<UserDoc>("users"),
    results: d.collection<ResultDoc>("results"),
    matches: d.collection<MatchDoc>("matches"),
  };
}
