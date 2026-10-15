"use client";
import { useEffect, useState } from "react";
import { LeaderboardList } from "@/components/LeaderboardList";
import { useSession } from "@/components/SessionProvider";
import { api, type LeaderEntry } from "@/lib/client";

type Board = { top: LeaderEntry[]; me: { rank: number; score: number } | null };
const TABS = [
  { id: "global", label: "Tổng sao", hint: "Cộng sao cao nhất của mỗi màn đã qua.", unit: "sao" },
  { id: "pvp", label: "Đấu 1-1", hint: "Điểm đấu tính theo hệ Elo, bắt đầu từ 1000.", unit: "điểm" },
] as const;

export default function LeaderboardPage() {
  const { user } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("global");
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api<Board>(`/api/leaderboard?type=${tab}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [tab]);

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-black tracking-tight">Bảng xếp hạng</h1>
      <div role="tablist" className="mt-4 inline-flex rounded-full bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === t.id ? "bg-ink text-paper" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-soft">{current.hint} Top 100 người chơi.</p>

      <div className="mt-4 rounded-2xl bg-card p-2">
        {error && <p className="p-4 text-bad-ink">{error}</p>}
        {!data && !error && <p className="p-4 text-ink-soft">Đang tải…</p>}
        {data && (
          <LeaderboardList
            entries={data.top}
            me={data.me}
            myId={user?.id}
            myName={user?.name}
            format={(s) => `${s} ${current.unit}`}
            empty={tab === "pvp" ? "Chưa có trận đấu nào. Vào Đấu 1-1 để mở màn." : "Chưa ai qua màn nào."}
          />
        )}
      </div>
    </div>
  );
}
