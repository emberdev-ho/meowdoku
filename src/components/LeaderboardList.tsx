import type { LeaderEntry } from "@/lib/client";

type Props = {
  entries: LeaderEntry[];
  me?: { rank: number; score: number } | null;
  myId?: string;
  myName?: string;
  format: (score: number) => string;
  empty: string;
};

export function LeaderboardList({ entries, me, myId, myName, format, empty }: Props) {
  if (entries.length === 0) return <p className="py-6 text-center text-ink-soft">{empty}</p>;
  const meInList = entries.some((e) => e.userId === myId);
  return (
    <ol className="divide-y divide-grid-thin">
      {entries.map((e) => (
        <Row key={e.userId} rank={e.rank} name={e.name} score={format(e.score)} highlight={e.userId === myId} />
      ))}
      {me && !meInList && (
        <>
          <li className="py-1 text-center text-ink-soft" aria-hidden>
            …
          </li>
          <Row rank={me.rank} name={myName ?? "Bạn"} score={format(me.score)} highlight />
        </>
      )}
    </ol>
  );
}

function Row({ rank, name, score, highlight }: { rank: number; name: string; score: string; highlight?: boolean }) {
  const medal = rank === 1 ? "bg-honey text-ink" : rank === 2 ? "bg-grid-thin text-ink" : rank === 3 ? "bg-[#d99a6c] text-ink" : "text-ink-soft";
  return (
    <li className={`flex items-center gap-3 px-3 py-2 ${highlight ? "rounded-lg bg-select" : ""}`}>
      <span className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-sm font-extrabold tabular-nums ${medal}`}>{rank}</span>
      <span className="flex-1 truncate font-semibold">{name}</span>
      <span className="font-bold tabular-nums">{score}</span>
    </li>
  );
}
