// Phiên đăng nhập dạng khách: cookie httpOnly chứa JWT ký bằng AUTH_SECRET.
// Sau này có thể thêm Auth.js (Google/Discord) và gắn tài khoản khách vào.
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { SignJWT, jwtVerify } from "jose";
import { collections, type UserDoc } from "./mongo";
import { ApiError } from "./http";
import { PVP } from "../config";
import { setDisplayName } from "./leaderboard";

const COOKIE = "md_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET phải dài ít nhất 32 ký tự");
  return new TextEncoder().encode(s);
}

async function readSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: "session" });
    return typeof payload.sub === "string" && ObjectId.isValid(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<UserDoc | null> {
  const id = await readSessionUserId();
  if (!id) return null;
  const { users } = await collections();
  return users.findOne({ _id: new ObjectId(id) });
}

export async function requireUser(): Promise<UserDoc> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Bạn cần vào game trước.");
  return user;
}

/** Trả về người chơi hiện tại, hoặc tạo tài khoản khách mới và đặt cookie. */
export async function ensureUser(): Promise<UserDoc> {
  const existing = await currentUser();
  if (existing) return existing;

  const { users } = await collections();
  const doc: UserDoc = {
    _id: new ObjectId(),
    name: `Mèo #${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: new Date(),
    maxLevel: 0,
    levelsCleared: 0,
    totalStars: 0,
    pvpRating: PVP.startRating,
    pvpWins: 0,
    pvpLosses: 0,
    pvpDraws: 0,
    coopClears: 0,
  };
  await users.insertOne(doc);
  await setDisplayName(doc._id.toHexString(), doc.name);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(doc._id.toHexString())
    .setAudience("session")
    .setIssuedAt()
    .setExpirationTime(`${ONE_YEAR}s`)
    .sign(secretKey());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return doc;
}

export function publicUser(u: UserDoc) {
  return {
    id: u._id.toHexString(),
    name: u.name,
    maxLevel: u.maxLevel,
    levelsCleared: u.levelsCleared,
    totalStars: u.totalStars,
    pvpRating: u.pvpRating,
    pvpWins: u.pvpWins,
    pvpLosses: u.pvpLosses,
    pvpDraws: u.pvpDraws,
    coopClears: u.coopClears,
  };
}
