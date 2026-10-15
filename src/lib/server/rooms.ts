// Phòng PvP và co-op lưu trên Redis (trạng thái tạm thời, tự hết hạn sau 2 giờ).
// Kết quả trận được ghi sang MongoDB khi kết thúc.
//
// Client hỏi trạng thái phòng mỗi ~1 giây (polling). Bàn sinh từ seed của phòng;
// mỗi nước nối được server kiểm tra lại trên bàn lưu ở Redis rồi mới ghi nhận.
// PvP: mỗi người một bàn riêng, ai xóa sạch trước thì thắng. Co-op: cả nhóm chung một bàn.
import { ObjectId } from "mongodb";
import { COOP, PVP, ROOM_TTL_SECONDS } from "../config";
import { GRAVITY_ORDER, decodeState, encodeState, initialState, isCleared, playMove, type Gravity, type Point, type Spec } from "../onet";
import { ApiError } from "./http";
import { collections, type UserDoc } from "./mongo";
import { hash, redis } from "./redis";
import { setPvpRating } from "./leaderboard";

export type Mode = "pvp" | "coop";
type Status = "waiting" | "playing" | "finished";

export type RoomResult =
  | { mode: "pvp"; winner: string | null; reason: string; changes: Record<string, number> }
  | { mode: "coop"; success: boolean; reason: string };

type Meta = {
  id: string;
  mode: Mode;
  spec: Spec;
  target: number; // số cặp cần nối để xóa sạch bàn
  status: Status;
  host: string;
  code: string;
  createdAt: number;
  startAt: number;
  endAt: number;
  filled: number; // co-op: số cặp cả nhóm đã nối
  result: RoomResult | null;
};

type PlayerInfo = { name: string; rating: number };

export const PENDING_KEY = "mm:pending"; // hash userId -> "roomId|ts" (trận PvP hiện tại)

export const roomKeys = (id: string) => ({
  meta: `room:${id}`,
  players: `room:${id}:players`,
  hb: `room:${id}:hb`, // userId -> lần cuối hỏi trạng thái (ms)
  prog: `room:${id}:prog`, // userId -> số cặp đã nối
  board: (uid: string) => `room:${id}:b:${uid}`, // PvP: bàn của từng người (encodeState)
  shared: `room:${id}:board`, // co-op: bàn chung
  lock: `room:${id}:lock`,
});
type Keys = ReturnType<typeof roomKeys>;
type Room = { k: Keys; meta: Meta; players: Record<string, PlayerInfo>; hb: Record<string, number> };

// Ghi bàn mới chỉ khi bàn trên Redis vẫn là bàn đã đọc (tránh hai nước ghi đè nhau).
// KEYS: khóa bàn. ARGV: giá trị cũ ("" nếu chưa có), giá trị mới, TTL giây.
const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1]) or ''
if cur ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`;

const strings = (o: Record<string, string | number>) =>
  Object.fromEntries(Object.entries(o).map(([key, v]) => [key, String(v)]));

export function newRoomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function allocateCode(roomId: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    let code = "";
    for (let j = 0; j < 5; j++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    const ok = await redis().set(`code:${code}`, roomId, { nx: true, ex: ROOM_TTL_SECONDS });
    if (ok === "OK") return code;
  }
  throw new ApiError(503, "Không tạo được mã phòng, thử lại.");
}

// ---------------------------------------------------------------------------

export async function createRoom(input: {
  mode: Mode;
  id?: string;
  host: string;
  players: { uid: string; name: string; rating: number }[];
  startNow: boolean;
}): Promise<string> {
  const board = input.mode === "pvp" ? PVP.board : COOP.board;
  // PvP đổi kiểu dồn ngẫu nhiên cho đa dạng; co-op để bàn đứng yên vì nhiều người cùng bấm.
  const gravity: Gravity = input.mode === "pvp" ? GRAVITY_ORDER[Math.floor(Math.random() * GRAVITY_ORDER.length)] : "none";
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const id = input.id ?? newRoomId();
  const k = roomKeys(id);
  const now = Date.now();
  const countdown = input.mode === "pvp" ? PVP.countdownMs : COOP.countdownMs;
  const startAt = input.startNow ? now + countdown : 0;
  const code = input.mode === "coop" ? await allocateCode(id) : "";

  const p = redis().pipeline();
  p.hset(
    k.meta,
    strings({
      id,
      mode: input.mode,
      rows: board.rows,
      cols: board.cols,
      kinds: board.kinds,
      gravity,
      seed,
      target: (board.rows * board.cols) / 2,
      status: input.startNow ? "playing" : "waiting",
      host: input.host,
      code,
      createdAt: now,
      startAt,
      endAt: 0,
      filled: 0,
    }),
  );
  p.hset(k.players, Object.fromEntries(input.players.map((pl) => [pl.uid, JSON.stringify({ name: pl.name, rating: pl.rating })])));
  p.hset(k.hb, Object.fromEntries(input.players.map((pl) => [pl.uid, String(Math.max(now, startAt))])));
  for (const key of [k.meta, k.players, k.hb]) p.expire(key, ROOM_TTL_SECONDS);
  await p.exec();
  return id;
}

async function loadRoom(id: string): Promise<Room> {
  if (!/^[a-f0-9]{12}$/.test(id)) throw new ApiError(404, "Phòng không tồn tại.");
  const k = roomKeys(id);
  const p = redis().pipeline();
  p.hgetall(k.meta);
  p.hgetall(k.players);
  p.hgetall(k.hb);
  const [m, pl, hb] = ((await p.exec()) as unknown[]).map(hash);
  if (!m || !m.mode) throw new ApiError(404, "Phòng không tồn tại hoặc đã hết hạn.");
  const meta: Meta = {
    id: m.id,
    mode: m.mode as Mode,
    spec: { rows: Number(m.rows), cols: Number(m.cols), kinds: Number(m.kinds), gravity: m.gravity as Gravity, seed: Number(m.seed) },
    target: Number(m.target),
    status: m.status as Status,
    host: m.host,
    code: m.code ?? "",
    createdAt: Number(m.createdAt),
    startAt: Number(m.startAt),
    endAt: Number(m.endAt),
    filled: Number(m.filled ?? 0),
    result: m.result ? (JSON.parse(m.result) as RoomResult) : null,
  };
  const players: Record<string, PlayerInfo> = {};
  for (const [uid, json] of Object.entries(pl ?? {})) players[uid] = JSON.parse(json);
  const beats: Record<string, number> = {};
  for (const [uid, ts] of Object.entries(hb ?? {})) beats[uid] = Number(ts);
  return { k, meta, players, hb: beats };
}

const toNums = (o: Record<string, string> | null) =>
  Object.fromEntries(Object.entries(o ?? {}).map(([key, v]) => [key, Number(v)])) as Record<string, number>;

const boardKey = (room: Room, uid: string) => (room.meta.mode === "pvp" ? room.k.board(uid) : room.k.shared);

// ---------------------------------------------------------------------------
// Trạng thái phòng cho từng người xem

export async function getRoomView(id: string, uid: string) {
  let room = await loadRoom(id);
  if (!room.players[uid]) throw new ApiError(403, "Bạn không ở trong phòng này.");
  const now = Date.now();
  if (room.meta.status !== "finished") {
    await redis().hset(room.k.hb, { [uid]: String(now) });
    room.hb[uid] = now;
  }
  if (room.meta.status === "playing" && (await maybeResolve(room, uid, now))) {
    room = await loadRoom(id);
  }

  const { meta } = room;
  const p = redis().pipeline();
  p.hgetall(room.k.prog);
  p.get(boardKey(room, uid));
  const [progRaw, boardRaw] = (await p.exec()) as [unknown, string | null];
  const progress = toNums(hash(progRaw));

  return {
    id: meta.id,
    mode: meta.mode,
    status: meta.status,
    rows: meta.spec.rows,
    cols: meta.spec.cols,
    gravity: meta.spec.gravity,
    // PvP: bàn của riêng người xem. Co-op: bàn chung của cả nhóm.
    board: boardRaw ?? encodeState(initialState(meta.spec)),
    target: meta.target,
    code: meta.mode === "coop" ? meta.code : undefined,
    startAt: meta.startAt,
    endAt: meta.endAt,
    now,
    teamFilled: meta.filled,
    result: meta.result,
    players: Object.entries(room.players).map(([pid, info]) => ({
      id: pid,
      name: info.name,
      rating: info.rating,
      progress: progress[pid] ?? 0,
      online: now - (room.hb[pid] ?? 0) < 8000,
      isMe: pid === uid,
      isHost: pid === meta.host,
    })),
  };
}

export type RoomView = Awaited<ReturnType<typeof getRoomView>>;

/** Xử lý hết giờ và bỏ cuộc. Trả về true nếu trận vừa kết thúc. */
async function maybeResolve(room: Room, uid: string, now: number): Promise<boolean> {
  const { meta } = room;
  if (now < meta.startAt) return false;
  if (meta.mode === "pvp") {
    const opponent = Object.keys(room.players).find((p) => p !== uid);
    if (opponent && now - (room.hb[opponent] ?? 0) > PVP.forfeitAfterMs) {
      await finish(room, { winner: uid, reason: "forfeit" });
      return true;
    }
    if (now > meta.startAt + PVP.maxDurationMs) {
      const prog = toNums(hash(await redis().hgetall(room.k.prog)));
      const [a, b] = Object.keys(room.players);
      const pa = prog[a] ?? 0;
      const pb = prog[b] ?? 0;
      await finish(room, { winner: pa === pb ? null : pa > pb ? a : b, reason: "timeout" });
      return true;
    }
  } else if (now > meta.startAt + COOP.maxDurationMs) {
    await finish(room, { success: false, reason: "timeout" });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Nước đi

export type MoveReply = { ok: false; board: string } | { ok: true; board: string; path: Point[]; autoShuffled: boolean };

export async function makeMove(id: string, uid: string, a: number, b: number): Promise<MoveReply> {
  const room = await loadRoom(id);
  const { k, meta } = room;
  if (!room.players[uid]) throw new ApiError(403, "Bạn không ở trong phòng này.");
  if (meta.status !== "playing") throw new ApiError(409, "Trận chưa bắt đầu hoặc đã kết thúc.");
  if (Date.now() < meta.startAt) throw new ApiError(409, "Chờ hết đếm ngược đã.");
  const n = meta.spec.rows * meta.spec.cols;
  if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x < n)) throw new ApiError(400, "Ô không hợp lệ.");

  const r = redis();
  const key = boardKey(room, uid);
  // Thử lại vài lần nếu người khác (co-op) vừa đổi bàn giữa lúc đọc và ghi.
  for (let attempt = 0; attempt < 4; attempt++) {
    const raw = await r.get<string>(key);
    const state = raw ? decodeState(raw) : initialState(meta.spec);
    const res = playMove(meta.spec, state, a, b);
    if (!res.ok) return { ok: false, board: raw ?? encodeState(state) };
    const next = encodeState(res.state);
    const saved = await r.eval(CAS_SCRIPT, [key], [raw ?? "", next, String(ROOM_TTL_SECONDS)]);
    if (Number(saved) !== 1) continue;

    const p = r.pipeline();
    p.hincrby(k.prog, uid, 1);
    p.expire(k.prog, ROOM_TTL_SECONDS);
    if (meta.mode === "coop") p.hincrby(k.meta, "filled", 1);
    await p.exec();
    if (isCleared(res.state)) {
      await finish(room, meta.mode === "pvp" ? { winner: uid, reason: "solved" } : { success: true, reason: "solved" });
    }
    return { ok: true, board: next, path: res.path, autoShuffled: res.autoShuffled };
  }
  throw new ApiError(409, "Bàn vừa thay đổi, thử lại.");
}

// ---------------------------------------------------------------------------
// Kết thúc trận: chỉ một request thắng được khóa và ghi kết quả.

function elo(ra: number, rb: number, scoreA: number): [number, number] {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  const delta = Math.round(PVP.eloK * (scoreA - ea));
  return [ra + delta, rb - delta];
}

async function finish(room: Room, outcome: { winner?: string | null; success?: boolean; reason: string }) {
  const { k, meta } = room;
  const r = redis();
  const got = await r.set(k.lock, "1", { nx: true, ex: ROOM_TTL_SECONDS });
  if (got !== "OK") return;

  const now = Date.now();
  const uids = Object.keys(room.players);
  const prog = toNums(hash(await r.hgetall(k.prog)));
  const { users, matches } = await collections();
  const oids = uids.map((u) => new ObjectId(u));

  let result: RoomResult;
  const ratingUpdates: { uid: string; before: number; after: number; res: "win" | "lose" | "draw" }[] = [];

  if (meta.mode === "pvp") {
    const winner = outcome.winner ?? null;
    const docs = await users.find({ _id: { $in: oids } }, { projection: { pvpRating: 1 } }).toArray();
    const rating = (u: string) => docs.find((d) => d._id.toHexString() === u)?.pvpRating ?? PVP.startRating;
    const [a, b] = uids;
    const scoreA = winner === null ? 0.5 : winner === a ? 1 : 0;
    const [na, nb] = elo(rating(a), rating(b), scoreA);
    const res = (u: string): "win" | "lose" | "draw" => (winner === null ? "draw" : winner === u ? "win" : "lose");
    ratingUpdates.push({ uid: a, before: rating(a), after: na, res: res(a) });
    if (b) ratingUpdates.push({ uid: b, before: rating(b), after: nb, res: res(b) });
    result = {
      mode: "pvp",
      winner,
      reason: outcome.reason,
      changes: Object.fromEntries(ratingUpdates.map((u) => [u.uid, u.after - u.before])),
    };
  } else {
    result = { mode: "coop", success: !!outcome.success, reason: outcome.reason };
  }

  // Ghi Redis trước để người chơi thấy kết quả ngay, rồi mới ghi MongoDB.
  const done = r.pipeline();
  done.hset(k.meta, { status: "finished", endAt: String(now), result: JSON.stringify(result) });
  if (meta.code) done.del(`code:${meta.code}`);
  if (meta.mode === "pvp") done.hdel(PENDING_KEY, ...uids);
  await done.exec();

  try {
    if (meta.mode === "pvp") {
      await users.bulkWrite(
        ratingUpdates.map((u) => ({
          updateOne: {
            filter: { _id: new ObjectId(u.uid) },
            update: {
              $set: { pvpRating: u.after },
              $inc: { pvpWins: u.res === "win" ? 1 : 0, pvpLosses: u.res === "lose" ? 1 : 0, pvpDraws: u.res === "draw" ? 1 : 0 },
            },
          },
        })),
      );
      await setPvpRating(ratingUpdates.map((u) => ({ userId: u.uid, rating: u.after })));
    } else if (outcome.success) {
      await users.updateMany({ _id: { $in: oids } }, { $inc: { coopClears: 1 } });
    }
    await matches.insertOne({
      roomId: meta.id,
      mode: meta.mode,
      puzzleId: `seed:${meta.spec.seed}:${meta.spec.gravity}`,
      outcome: outcome.reason,
      startedAt: new Date(meta.startAt),
      endedAt: new Date(now),
      players: uids.map((u) => {
        const ru = ratingUpdates.find((x) => x.uid === u);
        return {
          userId: new ObjectId(u),
          name: room.players[u].name,
          progress: prog[u] ?? 0,
          result: ru?.res,
          ratingBefore: ru?.before,
          ratingAfter: ru?.after,
        };
      }),
    });
  } catch (err) {
    console.error("Không ghi được kết quả trận vào MongoDB", meta.id, err);
  }
}

// ---------------------------------------------------------------------------
// Co-op: tạo phòng, vào phòng bằng mã, bắt đầu, rời phòng

export async function joinByCode(rawCode: string, user: UserDoc): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) throw new ApiError(400, "Mã phòng gồm 5 ký tự.");
  const id = await redis().get<string>(`code:${code}`);
  if (!id) throw new ApiError(404, "Không tìm thấy phòng với mã này.");
  const room = await loadRoom(id);
  const uid = user._id.toHexString();
  if (room.players[uid]) return id;
  if (room.meta.status !== "waiting") throw new ApiError(409, "Phòng đã bắt đầu chơi.");

  const p = redis().pipeline();
  p.hset(room.k.players, { [uid]: JSON.stringify({ name: user.name, rating: user.pvpRating }) });
  p.hset(room.k.hb, { [uid]: String(Date.now()) });
  p.hlen(room.k.players);
  const [, , count] = (await p.exec()) as [number, number, number];
  if (count > COOP.maxPlayers) {
    await redis().hdel(room.k.players, uid);
    throw new ApiError(409, `Phòng đã đủ ${COOP.maxPlayers} người.`);
  }
  return id;
}

export async function startRoom(id: string, uid: string) {
  const room = await loadRoom(id);
  if (room.meta.host !== uid) throw new ApiError(403, "Chỉ chủ phòng mới bắt đầu được.");
  if (room.meta.status !== "waiting") throw new ApiError(409, "Phòng đã bắt đầu.");
  const startAt = Date.now() + COOP.countdownMs;
  const p = redis().pipeline();
  p.hset(room.k.meta, { status: "playing", startAt: String(startAt) });
  p.hset(room.k.hb, Object.fromEntries(Object.keys(room.players).map((u) => [u, String(startAt)])));
  await p.exec();
}

export async function leaveRoom(id: string, uid: string) {
  const room = await loadRoom(id);
  if (!room.players[uid]) return;
  const { meta, k } = room;

  if (meta.status === "waiting") {
    await redis().hdel(k.players, uid);
    const remaining = Object.keys(room.players).filter((p) => p !== uid);
    if (remaining.length === 0) {
      const p = redis().pipeline();
      p.hset(k.meta, { status: "finished", endAt: String(Date.now()) });
      if (meta.code) p.del(`code:${meta.code}`);
      await p.exec();
    } else if (meta.host === uid) {
      await redis().hset(k.meta, { host: remaining[0] });
    }
    return;
  }

  if (meta.status === "playing") {
    if (meta.mode === "pvp") {
      const opponent = Object.keys(room.players).find((p) => p !== uid) ?? null;
      await finish(room, { winner: opponent, reason: "left" });
    } else {
      await redis().hset(k.hb, { [uid]: "0" });
    }
  }
}
