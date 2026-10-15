"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board, type Cell, type MarkMode } from "@/components/Board";
import { RequireUser, useSession } from "@/components/SessionProvider";
import { api, ClientError, formatTime, type User } from "@/lib/client";
import { parseRegions } from "@/lib/puzzle";
import type { RoomView } from "@/lib/server/rooms";
import { usePoll } from "@/lib/usePoll";
import { useBoardKeys } from "@/lib/useBoardKeys";

const PLAYER_COLORS = ["#E8457A", "#4A7BD0", "#E3A21A", "#23A06A"];

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  return <RequireUser>{(user) => <Room id={id} user={user} />}</RequireUser>;
}

function Room({ id, user }: { id: string; user: User }) {
  const router = useRouter();
  const { refresh: refreshUser } = useSession();
  const [finished, setFinished] = useState(false);
  const { data: view, error, refresh } = usePoll<RoomView>(finished ? null : `/api/rooms/${id}`, 1000);
  // Dấu X chỉ nằm ở máy người chơi; mèo đã đặt đúng lấy từ server.
  const [marks, setMarks] = useState<Set<number>>(new Set());
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<number[] | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const offset = useRef(0);

  useEffect(() => {
    if (!view) return;
    offset.current = view.now - Date.now();
    if (view.status === "finished" && !finished) {
      setFinished(true);
      refreshUser();
    }
  }, [view, finished, refreshUser]);

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const serverNow = clock + offset.current;
  const size = view?.size ?? 7;
  const regions = useMemo(() => (view ? parseRegions(view.regions) : []), [view?.regions]);
  const cats = useMemo(() => {
    const s = new Set<number>([...(view?.given ?? []), ...(view?.cats ?? []), ...placed, ...pending]);
    return s;
  }, [view, placed, pending]);
  const cells = useMemo<Cell[]>(
    () => Array.from({ length: size * size }, (_, i) => (cats.has(i) ? 2 : marks.has(i) ? 1 : 0)),
    [size, cats, marks],
  );
  const locked = useMemo(() => cells.map((v) => v === 2), [cells]);

  const colorOf = useMemo(() => {
    const map: Record<string, string> = {};
    view?.players.forEach((p, i) => (map[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length]));
    return map;
  }, [view?.players]);

  const counting = !!view && view.status === "playing" && serverNow < view.startAt;
  const canPlay = !!view && view.status === "playing" && !counting;

  const toggleMark = (i: number, on: boolean) =>
    setMarks((m) => {
      const next = new Set(m);
      if (on) next.add(i);
      else next.delete(i);
      return next;
    });

  /** Gửi con mèo lên server kiểm tra. Đặt sai thì ô quay về dấu X và bị tính một lần sai. */
  const placeCat = async (idx: number) => {
    if (!canPlay || cats.has(idx)) return;
    setMoveError(null);
    setPending((p) => new Set(p).add(idx));
    try {
      const res = await api<{ correct: boolean }>(`/api/rooms/${id}/move`, { method: "POST", body: { idx } });
      if (res.correct) {
        setPlaced((p) => new Set(p).add(idx));
        toggleMark(idx, false);
      } else {
        toggleMark(idx, true);
        setFlash([idx]);
        setTimeout(() => setFlash(null), 650);
      }
    } catch (e) {
      if (!(e instanceof ClientError && e.status === 409)) setMoveError((e as Error).message);
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(idx);
        return next;
      });
    }
    refresh();
  };

  const tap = (i: number) => {
    setSelected(i);
    if (!canPlay || cats.has(i)) return;
    if (marks.has(i)) placeCat(i);
    else toggleMark(i, true);
  };

  const mark = (i: number, mode: MarkMode) => {
    if (!canPlay || cats.has(i)) return;
    toggleMark(i, mode === "mark");
  };

  useBoardKeys({
    size,
    selected,
    setSelected,
    onTap: () => selected !== null && tap(selected),
    onPlace: () => selected !== null && placeCat(selected),
    onToggleMark: () => selected !== null && !cats.has(selected) && toggleMark(selected, !marks.has(selected)),
    onClear: () => selected !== null && toggleMark(selected, false),
    enabled: canPlay,
  });

  const leave = async () => {
    if (view?.status === "playing" && view.mode === "pvp" && !confirm("Rời trận sẽ bị xử thua. Bạn chắc chứ?")) return;
    await api(`/api/rooms/${id}/leave`, { method: "POST" }).catch(() => {});
    router.push(view?.mode === "pvp" ? "/pvp" : "/coop");
  };

  if (!view)
    return (
      <div className="py-16 text-center">
        {error ? (
          <>
            <p className="text-lg font-bold">{error}</p>
            <Link href="/" className="mt-4 inline-block rounded-xl bg-card px-4 py-2 font-bold">
              Về trang chủ
            </Link>
          </>
        ) : (
          <p className="text-ink-soft">Đang vào phòng…</p>
        )}
      </div>
    );

  if (view.status === "waiting") return <WaitingRoom view={view} id={id} onLeave={leave} onStarted={refresh} colorOf={colorOf} />;

  const me = view.players.find((p) => p.isMe)!;
  const elapsed = view.startAt ? (view.endAt || serverNow) - view.startAt : 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-[min(92vw,520px)] items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{view.mode === "pvp" ? "Đấu 1-1" : "Chơi cùng bạn"}</h1>
          <p className="text-sm font-semibold text-ink-soft">
            {view.mode === "pvp"
              ? `Sai ${me.mistakes}/${view.maxMistakes}`
              : `Cả nhóm sai ${view.teamMistakes}/${view.maxMistakes}, đã đặt ${view.teamFilled}/${view.target} mèo`}
          </p>
        </div>
        <p className="text-2xl font-black tabular-nums">{formatTime(Math.max(0, elapsed))}</p>
      </div>

      <ul className="grid w-full max-w-[min(92vw,520px)] gap-1.5">
        {view.players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorOf[p.id] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">
              {p.name}
              {p.isMe && " (bạn)"}
              {!p.online && view.status === "playing" && <span className="font-semibold text-ink-soft"> · mất kết nối</span>}
            </span>
            {view.mode === "pvp" ? (
              <span className="flex w-2/5 items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                  <span
                    className="block h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${(p.progress / view.target) * 100}%`, background: colorOf[p.id] }}
                  />
                </span>
                <span className="w-10 text-right text-xs font-bold tabular-nums">
                  {p.progress}/{view.target}
                </span>
              </span>
            ) : (
              <span className="text-xs font-bold text-ink-soft tabular-nums">{p.progress} mèo</span>
            )}
          </li>
        ))}
      </ul>

      {view.status === "finished" && view.result && <ResultPanel view={view} meId={user.id} />}

      <div className="relative w-full max-w-[min(92vw,520px)]">
        <Board
          size={size}
          regions={regions}
          cells={cells}
          locked={locked}
          given={view.given}
          pending={pending}
          selected={selected}
          flash={flash}
          catKind={view.mode === "pvp" ? 2 : 5}
          ownerColor={view.mode === "coop" ? (i) => colorOf[view.owners[i]] : undefined}
          disabled={!canPlay}
          onTap={tap}
          onMark={mark}
        />
        {counting && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-card/85" aria-live="assertive">
            <span key={Math.ceil((view.startAt - serverNow) / 1000)} className="anim-tick text-8xl font-black">
              {Math.max(1, Math.ceil((view.startAt - serverNow) / 1000))}
            </span>
          </div>
        )}
      </div>

      {view.status === "playing" && (
        <>
          <p className="max-w-[min(92vw,520px)] text-center text-sm text-ink-soft">
            Bấm một ô để đánh X, bấm lần nữa để đặt mèo. Mỗi con mèo được kiểm tra ngay với lời giải.
          </p>
          {moveError && <p className="text-sm font-semibold text-bad-ink">{moveError}</p>}
          <button onClick={leave} className="text-sm font-semibold text-ink-soft underline underline-offset-4">
            {view.mode === "pvp" ? "Bỏ cuộc" : "Rời phòng"}
          </button>
        </>
      )}
    </div>
  );
}

function WaitingRoom({
  view,
  id,
  onLeave,
  onStarted,
  colorOf,
}: {
  view: RoomView;
  id: string;
  onLeave: () => void;
  onStarted: () => void;
  colorOf: Record<string, string>;
}) {
  const me = view.players.find((p) => p.isMe)!;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    try {
      await api(`/api/rooms/${id}/start`, { method: "POST" });
      onStarted();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="text-2xl font-black tracking-tight">Phòng chờ</h1>
      <p className="mt-1 text-ink-soft">Gửi mã này cho bạn bè để cùng chơi.</p>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(view.code ?? "");
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-4 rounded-3xl bg-card px-8 py-4 text-5xl font-black tracking-[0.2em]"
        aria-label={`Mã phòng ${view.code}, bấm để sao chép`}
      >
        {view.code}
      </button>
      <p className="mt-1 h-5 text-sm font-semibold text-good">{copied ? "Đã sao chép mã" : ""}</p>

      <ul className="mt-4 grid gap-1.5 text-left">
        {view.players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5">
            <span className="h-3 w-3 rounded-full" style={{ background: colorOf[p.id] }} aria-hidden />
            <span className="flex-1 font-bold">
              {p.name}
              {p.isMe && " (bạn)"}
            </span>
            {p.isHost && <span className="text-xs font-bold text-ink-soft">Chủ phòng</span>}
          </li>
        ))}
      </ul>

      {me.isHost ? (
        <>
          <button onClick={start} className="mt-6 w-full rounded-2xl bg-yarn py-3.5 text-lg font-extrabold text-yarn-ink">
            Bắt đầu
          </button>
          {view.players.length === 1 && <p className="mt-2 text-sm text-ink-soft">Có thể bắt đầu một mình, nhưng vui hơn khi có bạn.</p>}
        </>
      ) : (
        <p className="mt-6 font-semibold text-ink-soft">Chờ chủ phòng bắt đầu…</p>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-bad-ink">{error}</p>}
      <button onClick={onLeave} className="mt-4 text-sm font-semibold text-ink-soft underline underline-offset-4">
        Rời phòng
      </button>
    </div>
  );
}

const PVP_REASON: Record<string, [string, string]> = {
  // [khi bạn thắng, khi bạn thua]
  solved: ["Bạn đặt đủ mèo trước.", "Đối thủ đặt đủ mèo trước."],
  mistakes: ["Đối thủ sai quá số lần cho phép.", "Bạn sai quá số lần cho phép."],
  forfeit: ["Đối thủ mất kết nối quá lâu.", "Bạn mất kết nối quá lâu."],
  left: ["Đối thủ đã rời trận.", "Bạn đã rời trận."],
  timeout: ["Hết giờ, bạn đặt được nhiều mèo hơn.", "Hết giờ, đối thủ đặt được nhiều mèo hơn."],
};

function ResultPanel({ view, meId }: { view: RoomView; meId: string }) {
  const r = view.result!;
  let title: string;
  let detail: string;
  let extra: string | null = null;

  if (r.mode === "pvp") {
    const won = r.winner === meId;
    title = r.winner === null ? "Hòa" : won ? "Bạn thắng!" : "Bạn thua";
    detail = r.winner === null ? "Hết giờ, hai bên đặt được số mèo bằng nhau." : (PVP_REASON[r.reason]?.[won ? 0 : 1] ?? "");
    const d = r.changes[meId] ?? 0;
    extra = `${d >= 0 ? "+" : ""}${d} điểm đấu`;
  } else {
    title = r.success ? "Cả nhóm giải xong!" : "Chưa giải được";
    detail = r.success ? "Mọi vùng đã có mèo." : r.reason === "mistakes" ? "Cả nhóm sai quá số lần cho phép." : "Đã hết giờ.";
  }

  return (
    <div className="w-full max-w-[min(92vw,520px)] rounded-3xl bg-card p-5 text-center" role="status">
      <p className="text-3xl font-black tracking-tight">{title}</p>
      <p className="mt-1 text-ink-soft">{detail}</p>
      {extra && <p className="mt-2 text-xl font-black tabular-nums">{extra}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <Link href={view.mode === "pvp" ? "/pvp" : "/coop"} className="rounded-2xl bg-yarn px-5 py-2.5 font-extrabold text-yarn-ink">
          {view.mode === "pvp" ? "Tìm trận mới" : "Chơi phòng mới"}
        </Link>
        <Link href="/leaderboard" className="rounded-2xl bg-paper px-5 py-2.5 font-bold">
          Xếp hạng
        </Link>
      </div>
    </div>
  );
}
