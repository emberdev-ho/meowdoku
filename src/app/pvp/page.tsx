"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CatIcon } from "@/components/CatIcon";
import { RequireUser } from "@/components/SessionProvider";
import { api, type User } from "@/lib/client";
import { PVP } from "@/lib/config";

type QueueState = { status: "waiting"; waitedMs: number } | { status: "matching" } | { status: "matched"; roomId: string };

export default function PvpPage() {
  return <RequireUser>{(user) => <Lobby user={user} />}</RequireUser>;
}

function Lobby({ user }: { user: User }) {
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [waited, setWaited] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const searchingRef = useRef(false);

  useEffect(() => {
    if (!searching) return;
    searchingRef.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await api<QueueState>("/api/pvp/queue", { method: "POST" });
        if (!searchingRef.current) return;
        if (s.status === "matched") {
          searchingRef.current = false;
          router.push(`/room/${s.roomId}`);
          return;
        }
        if (s.status === "waiting") setWaited(s.waitedMs);
      } catch (e) {
        setError((e as Error).message);
        setSearching(false);
        return;
      }
      timer = setTimeout(tick, 1500);
    };
    tick();
    return () => {
      clearTimeout(timer);
      if (searchingRef.current) {
        searchingRef.current = false;
        fetch("/api/pvp/queue", { method: "DELETE", keepalive: true });
      }
    };
  }, [searching, router]);

  const games = user.pvpWins + user.pvpLosses + user.pvpDraws;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-black tracking-tight">Đấu 1-1</h1>
      <p className="mt-2 text-ink-soft">
        Hai người giải cùng một đề 9×9. Mỗi chú mèo đặt xuống đều được kiểm tra ngay. Sai {PVP.maxMistakes} lần là thua, ai giải xong trước thì thắng.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        <Stat label="Điểm đấu" value={user.pvpRating} />
        <Stat label="Thắng" value={user.pvpWins} />
        <Stat label="Thua" value={user.pvpLosses} />
      </div>

      <div className="mt-8 rounded-3xl bg-card p-6 text-center">
        {searching ? (
          <>
            <div className="flex justify-center gap-2" aria-hidden>
              {[1, 7, 3].map((v) => (
                <CatIcon key={v} value={v} className="h-12 w-12 motion-safe:animate-bounce" label="" />
              ))}
            </div>
            <p className="mt-4 text-lg font-extrabold" role="status">
              Đang tìm đối thủ… {Math.floor(waited / 1000)}s
            </p>
            <p className="text-sm text-ink-soft">Chờ càng lâu, phạm vi điểm đấu tìm kiếm càng rộng.</p>
            <button onClick={() => setSearching(false)} className="mt-5 rounded-2xl bg-paper px-6 py-3 font-bold">
              Hủy tìm trận
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setError(null);
                setWaited(0);
                setSearching(true);
              }}
              className="rounded-2xl bg-yarn px-8 py-4 text-lg font-extrabold text-yarn-ink shadow-[0_4px_0_rgba(0,0,0,0.18)] active:translate-y-0.5"
            >
              Tìm trận
            </button>
            <p className="mt-3 text-sm text-ink-soft">{games === 0 ? "Trận đầu tiên của bạn." : `Đã đấu ${games} trận.`}</p>
          </>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-bad-ink">{error}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-card py-3">
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="text-xs font-semibold text-ink-soft">{label}</p>
    </div>
  );
}
