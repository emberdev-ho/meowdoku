"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireUser } from "@/components/SessionProvider";
import { Stars } from "@/components/Stars";
import { api, formatTime, type User } from "@/lib/client";
import { CHUNK_COUNT, CHUNK_SIZE, LEVEL_COUNT, chunkOf, levelSpec } from "@/lib/config";

const sizeLabel = (id: number) => {
  const s = levelSpec(id);
  return `${s.rows}×${s.cols}`;
};

type Progress = { maxLevel: number; results: { levelId: number; stars: number; bestTime: number }[] };

export default function LevelMap() {
  return <RequireUser>{(user) => <LevelGrid user={user} />}</RequireUser>;
}

function LevelGrid({ user }: { user: User }) {
  const [chunk, setChunk] = useState(() => chunkOf(Math.min(LEVEL_COUNT, user.maxLevel + 1)));
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProgress(null);
    api<Progress>(`/api/me/progress?chunk=${chunk}`)
      .then(setProgress)
      .catch((e: Error) => setError(e.message));
  }, [chunk]);

  const from = chunk * CHUNK_SIZE + 1;
  const to = Math.min(LEVEL_COUNT, from + CHUNK_SIZE - 1);
  const sizes = [...new Set(Array.from({ length: to - from + 1 }, (_, k) => sizeLabel(from + k)))];
  const byId = new Map(progress?.results.map((r) => [r.levelId, r]));
  const maxLevel = progress?.maxLevel ?? user.maxLevel;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            Màn {from}–{to}
          </h1>
          <p className="text-ink-soft">
            Bàn {sizes.length > 1 ? `${sizes[0]} đến ${sizes[sizes.length - 1]}` : sizes[0]}. Đã qua{" "}
            {user.levelsCleared}/{LEVEL_COUNT} màn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChunk((c) => c - 1)}
            disabled={chunk === 0}
            className="rounded-xl bg-card px-3 py-2 font-bold disabled:opacity-30"
            aria-label="Gói màn trước"
          >
            ‹
          </button>
          <label className="sr-only" htmlFor="chunk">
            Chọn gói màn
          </label>
          <select
            id="chunk"
            value={chunk}
            onChange={(e) => setChunk(Number(e.target.value))}
            className="rounded-xl bg-card px-3 py-2 font-semibold"
          >
            {Array.from({ length: CHUNK_COUNT }, (_, i) => (
              <option key={i} value={i}>
                Màn {i * CHUNK_SIZE + 1}–{Math.min(LEVEL_COUNT, (i + 1) * CHUNK_SIZE)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setChunk((c) => c + 1)}
            disabled={chunk === CHUNK_COUNT - 1}
            className="rounded-xl bg-card px-3 py-2 font-bold disabled:opacity-30"
            aria-label="Gói màn sau"
          >
            ›
          </button>
        </div>
      </div>

      {error && <p className="mt-6 text-bad-ink">{error}</p>}

      <ol className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
        {Array.from({ length: to - from + 1 }, (_, k) => {
          const id = from + k;
          const res = byId.get(id);
          const unlocked = id <= maxLevel + 1;
          const isNext = id === maxLevel + 1;
          if (!unlocked)
            return (
              <li key={id} className="grid aspect-square place-items-center rounded-xl border border-dashed border-grid-thin text-ink-soft/60">
                <span className="text-sm font-bold tabular-nums">{id}</span>
              </li>
            );
          return (
            <li key={id}>
              <Link
                href={`/play/${id}`}
                title={res ? `Kỷ lục ${formatTime(res.bestTime)}` : undefined}
                className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl font-extrabold tabular-nums transition active:translate-y-px ${
                  isNext ? "bg-yarn text-yarn-ink shadow-[0_3px_0_rgba(0,0,0,0.2)]" : "bg-card"
                }`}
              >
                {id}
                {res ? <Stars count={res.stars} className="h-3 w-3" /> : progress === null ? null : <span className="h-3" />}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
