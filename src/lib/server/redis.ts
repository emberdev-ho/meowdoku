// Upstash Redis qua HTTP: hợp với serverless vì không phải giữ kết nối.
// Nhận cả biến UPSTASH_* lẫn KV_* (tên mà Vercel Marketplace tự tạo).
import { Redis } from "@upstash/redis";

let client: Redis | null = null;

export function redis(): Redis {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error("Thiếu cấu hình Upstash Redis");
    // Tắt tự parse JSON để mọi giá trị trả về đều là chuỗi, dễ kiểm soát kiểu.
    client = new Redis({ url, token, automaticDeserialization: false });
  }
  return client;
}

/** ZRANGE ... WITHSCORES trả về mảng phẳng [member, score, member, score...]. */
export function pairs(flat: unknown[]): { member: string; score: number }[] {
  const out: { member: string; score: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push({ member: String(flat[i]), score: Number(flat[i + 1]) });
  }
  return out;
}

/**
 * Khi tắt automaticDeserialization, HGETALL trả về mảng phẳng [field, value, ...]
 * thay vì object. Hàm này chuẩn hóa về object (hoặc null nếu hash không tồn tại).
 */
export function hash(raw: unknown): Record<string, string> | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }
  return raw as Record<string, string>;
}

/** HMGET trả về mảng giá trị theo đúng thứ tự field. */
export async function hmget(key: string, fields: string[]): Promise<Record<string, string | null>> {
  const raw = (await redis().hmget(key, ...fields)) as unknown;
  if (Array.isArray(raw)) return Object.fromEntries(fields.map((f, i) => [f, raw[i] == null ? null : String(raw[i])]));
  return (raw as Record<string, string | null>) ?? {};
}
