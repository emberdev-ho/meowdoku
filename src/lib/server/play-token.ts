// Vé chơi màn: server ghi thời điểm bắt đầu và số gợi ý đã dùng vào JWT,
// nên không cần lưu trạng thái và không tin thời gian do client tự báo.
import { SignJWT, jwtVerify } from "jose";
import { secretKey } from "./auth";
import { ApiError } from "./http";

export type PlayClaims = { uid: string; lvl: number; t0: number; hints: number };

export async function signPlayToken(c: PlayClaims): Promise<string> {
  return new SignJWT({ lvl: c.lvl, t0: c.t0, hints: c.hints })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.uid)
    .setAudience("play")
    .setExpirationTime("12h")
    .sign(secretKey());
}

export async function verifyPlayToken(token: unknown, uid: string, lvl: number): Promise<PlayClaims> {
  if (typeof token !== "string") throw new ApiError(400, "Thiếu vé chơi.");
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: "play" });
    const claims = {
      uid: String(payload.sub),
      lvl: Number(payload.lvl),
      t0: Number(payload.t0),
      hints: Number(payload.hints),
    };
    if (claims.uid !== uid || claims.lvl !== lvl) throw new Error("mismatch");
    return claims;
  } catch {
    throw new ApiError(400, "Vé chơi không hợp lệ hoặc đã hết hạn. Hãy mở lại màn.");
  }
}
