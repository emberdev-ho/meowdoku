// Ghép trận PvP theo rating. Client gọi pollQueue mỗi ~1.5 giây.
// Toàn bộ bước "tìm đối thủ + lấy cả hai ra khỏi hàng chờ" chạy trong một
// script Lua nên là nguyên tử: không bao giờ có người bị ghép vào hai trận.
import { ObjectId } from "mongodb";
import { PVP } from "../config";
import { collections, type UserDoc } from "./mongo";
import { redis } from "./redis";
import { PENDING_KEY, createRoom, newRoomId } from "./rooms";

const QUEUE = "mm:queue"; // zset userId, score = rating
const HEARTBEAT = "mm:hb"; // hash userId -> ms
const JOINED = "mm:joined"; // hash userId -> ms vào hàng chờ
const STALE_MS = 6000; // không hỏi lại trong 6s coi như đã rời hàng chờ

// KEYS: queue, heartbeat, joined, pending
// ARGV: uid, rating, now, staleMs, roomIdDuPhong
const MATCH_SCRIPT = `
local uid = ARGV[1]
local rating = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local stale = tonumber(ARGV[4])

local pending = redis.call('HGET', KEYS[4], uid)
if pending then return {'room', pending} end

redis.call('HSET', KEYS[2], uid, now)
local joined = redis.call('HGET', KEYS[3], uid)
if not joined then
  redis.call('HSET', KEYS[3], uid, now)
  joined = now
end
local waited = now - tonumber(joined)
local window = 100 + math.floor(waited / 1000) * 25

local cands = redis.call('ZRANGEBYSCORE', KEYS[1], rating - window, rating + window)
for _, c in ipairs(cands) do
  if c ~= uid then
    local hb = tonumber(redis.call('HGET', KEYS[2], c) or '0')
    if now - hb > stale then
      redis.call('ZREM', KEYS[1], c)
      redis.call('HDEL', KEYS[2], c)
      redis.call('HDEL', KEYS[3], c)
    else
      redis.call('ZREM', KEYS[1], c, uid)
      redis.call('HDEL', KEYS[2], c, uid)
      redis.call('HDEL', KEYS[3], c, uid)
      local marker = ARGV[5] .. '|' .. ARGV[3]
      redis.call('HSET', KEYS[4], uid, marker, c, marker)
      return {'match', c}
    end
  end
end

redis.call('ZADD', KEYS[1], rating, uid)
return {'wait', tostring(waited)}
`;

export type QueueState =
  | { status: "waiting"; waitedMs: number }
  | { status: "matching" }
  | { status: "matched"; roomId: string };

export async function pollQueue(user: UserDoc): Promise<QueueState> {
  const uid = user._id.toHexString();
  const r = redis();

  for (let attempt = 0; attempt < 2; attempt++) {
    const roomId = newRoomId();
    const now = Date.now();
    const [kind, value] = await r.eval<string[], [string, string]>(
      MATCH_SCRIPT,
      [QUEUE, HEARTBEAT, JOINED, PENDING_KEY],
      [uid, String(user.pvpRating), String(now), String(STALE_MS), roomId],
    );

    if (kind === "wait") return { status: "waiting", waitedMs: Number(value) };

    if (kind === "match") {
      const opponentId = value;
      const { users } = await collections();
      const opp = await users.findOne({ _id: new ObjectId(opponentId) });
      await createRoom({
        mode: "pvp",
        id: roomId,
        host: uid,
        startNow: true,
        players: [
          { uid, name: user.name, rating: user.pvpRating },
          { uid: opponentId, name: opp?.name ?? "Mèo ẩn danh", rating: opp?.pvpRating ?? PVP.startRating },
        ],
      });
      return { status: "matched", roomId };
    }

    // kind === "room": người này đã được ghép, kiểm tra phòng đã tạo xong chưa.
    const [pendingRoom, ts] = value.split("|");
    const status = await r.hget<string>(`room:${pendingRoom}`, "status");
    if (status && status !== "finished") return { status: "matched", roomId: pendingRoom };
    if (!status && now - Number(ts) < 15_000) return { status: "matching" };
    // Phòng đã xong hoặc tạo hỏng: xóa dấu và vào lại hàng chờ.
    await r.hdel(PENDING_KEY, uid);
  }
  return { status: "matching" };
}

export async function leaveQueue(uid: string) {
  const p = redis().pipeline();
  p.zrem(QUEUE, uid);
  p.hdel(HEARTBEAT, uid);
  p.hdel(JOINED, uid);
  await p.exec();
}
