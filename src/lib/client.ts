// Helper phía trình duyệt.

export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ClientError(data.error ?? "Có lỗi xảy ra, thử lại sau.", res.status);
  return data as T;
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export type User = {
  id: string;
  name: string;
  maxLevel: number;
  levelsCleared: number;
  totalStars: number;
  pvpRating: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  coopClears: number;
};

export type LeaderEntry = { rank: number; userId: string; name: string; score: number };
