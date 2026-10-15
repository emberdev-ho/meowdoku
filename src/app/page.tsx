"use client";
import Link from "next/link";
import { useState } from "react";
import { Board } from "@/components/Board";
import { useSession } from "@/components/SessionProvider";
import { api, type User } from "@/lib/client";
import { LEVEL_COUNT } from "@/lib/config";
import type { Point } from "@/lib/onet";

// Bàn 4×6 để trang trí: hai chú mèo giống nhau (ô 1 và ô 16) nối bằng đường vòng qua viền trên.
const SAMPLE_CELLS = [13, 7, 22, 30, 0, 4, 2, 27, 0, 16, 0, 33, 25, 9, 18, 0, 7, 11, 34, 0, 6, 21, 29, 15];
const SAMPLE_PATH: Point[] = [
  [0, 1],
  [-1, 1],
  [-1, 4],
  [2, 4],
];

export default function Home() {
  const { user } = useSession();
  const next = Math.min(LEVEL_COUNT, (user?.maxLevel ?? 0) + 1);

  return (
    <div className="grid items-center gap-10 py-4 md:grid-cols-[1.1fr_1fr] md:py-10">
      <section>
        <h1 className="text-[clamp(3rem,11vw,6.5rem)] leading-[0.9] font-black tracking-[-0.04em]">Meowdoku</h1>
        <p className="mt-4 max-w-[34ch] text-lg text-ink-soft">
          Nối hai chú mèo giống hệt nhau bằng đường đi rẽ tối đa hai lần. Xóa sạch bàn trước khi hết giờ để qua màn.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={`/play/${next}`}
            className="rounded-2xl bg-yarn px-6 py-3.5 text-lg font-extrabold text-yarn-ink shadow-[0_4px_0_rgba(0,0,0,0.18)] active:translate-y-0.5"
          >
            {user && user.maxLevel > 0 ? `Chơi tiếp màn ${next}` : "Chơi màn đầu tiên"}
          </Link>
          <Link href="/pvp" className="rounded-2xl bg-card px-5 py-3.5 font-bold">
            Đấu 1-1
          </Link>
          <Link href="/coop" className="rounded-2xl bg-card px-5 py-3.5 font-bold">
            Chơi cùng bạn
          </Link>
        </div>

        {user && <Profile user={user} />}
      </section>

      <div className="mx-auto w-full max-w-md rotate-1" aria-hidden>
        <Board rows={4} cols={6} cells={SAMPLE_CELLS} selected={null} hint={[1, 16]} path={SAMPLE_PATH} disabled onPick={() => {}} />
      </div>
    </div>
  );
}

function Profile({ user }: { user: User }) {
  const { setUser } = useSession();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      setUser(await api<User>("/api/me", { method: "PATCH", body: { name } }));
      setEditing(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mt-10 max-w-md rounded-2xl bg-card p-4">
      {editing ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="sr-only" htmlFor="name">
            Tên hiển thị
          </label>
          <input
            id="name"
            value={name}
            maxLength={20}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-grid-thin bg-paper px-3 py-2 font-semibold"
          />
          <button className="rounded-lg bg-ink px-4 font-bold text-paper">Lưu tên</button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-lg font-extrabold">{user.name}</p>
          <button onClick={() => setEditing(true)} className="text-sm font-semibold text-ink-soft underline underline-offset-4">
            Đổi tên
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-bad-ink">{error}</p>}

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Màn đã qua" value={user.levelsCleared} />
        <Stat label="Sao" value={user.totalStars} />
        <Stat label="Điểm đấu" value={user.pvpRating} />
      </dl>

    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-paper py-2">
      <dd className="text-xl font-black tabular-nums">{value}</dd>
      <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
    </div>
  );
}
