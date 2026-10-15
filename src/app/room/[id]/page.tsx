"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board, useTransposed, visibleGravity } from "@/components/Board";
import { RequireUser, useSession } from "@/components/SessionProvider";
import { api, ClientError, formatTime, type User } from "@/lib/client";
import { COOP, PVP } from "@/lib/config";
import { GRAVITY_LABEL, decodeState, findPath, remaining, type Point } from "@/lib/onet";
import type { MoveReply, RoomView } from "@/lib/server/rooms";
import { usePoll } from "@/lib/usePoll";
import { useBoardKeys } from "@/lib/useBoardKeys";

const PLAYER_COLORS = ["#E8457A", "#4A7BD0", "#E3A21A", "#23A06A"];
const LINK_MS = 220;

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  return <RequireUser>{(user) => <Room id={id} user={user} />}</RequireUser>;
}

function Room({ id, user }: { id: string; user: User }) {
  const router = useRouter();
  const { refresh: refreshUser } = useSession();
  const [finished, setFinished] = useState(false);
  const { data: view, error, refresh } = usePoll<RoomView>(finished ? null : `/api/rooms/${id}`, 1000);
  // Bàn mới nhất server trả về sau nước đi của mình (trước khi lần hỏi trạng thái kế tiếp về tới).
  const [local, setLocal] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [flash, setFlash] = useState<number[] | null>(null);
  const [path, setPath] = useState<Point[] | null>(null);
  const [removing, setRemoving] = useState<number[] | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const offset = useRef(0);
  const sending = useRef(false);

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
  const spec = view ? { rows: view.rows, cols: view.cols } : { rows: 8, cols: 12 };
  const transposed = useTransposed(spec.rows, spec.cols);

  // Bàn chỉ mất dần ô (trộn không làm đổi số ô), nên bàn còn ít ô hơn là bàn mới hơn.
  const state = useMemo(() => {
    if (!view) return null;
    const fromServer = decodeState(view.board);
    if (!local) return fromServer;
    const mine = decodeState(local);
    return remaining(mine) < remaining(fromServer) ? mine : fromServer;
  }, [view, local]);

  // Ô đang chọn bị người khác nối mất (co-op) hoặc bị dồn đi thì bỏ chọn.
  const selectedKind = useRef(0);
  useEffect(() => {
    if (selected !== null && state && state.cells[selected] !== selectedKind.current) setSelected(null);
  }, [state, selected]);

  const counting = !!view && view.status === "playing" && serverNow < view.startAt;
  const canPlay = !!view && view.status === "playing" && !counting;

  const pick = async (i: number) => {
    if (!view || !state || !canPlay || sending.current || !state.cells[i]) return;
    setCursor(i);
    if (selected === null || selected === i || state.cells[selected] !== state.cells[i]) {
      const next = selected === i ? null : i;
      selectedKind.current = next === null ? 0 : state.cells[i];
      setSelected(next);
      return;
    }
    const a = selected;
    // Kiểm tra trước trên máy để vẽ đường nối ngay; server vẫn kiểm tra lại.
    const preview = findPath(state.cells, spec.rows, spec.cols, a, i);
    if (!preview) {
      setFlash([a, i]);
      setTimeout(() => setFlash(null), 500);
      selectedKind.current = state.cells[i];
      setSelected(i);
      return;
    }
    setSelected(null);
    setPath(preview);
    setRemoving([a, i]);
    sending.current = true;
    setMoveError(null);
    try {
      const res = await api<MoveReply>(`/api/rooms/${id}/move`, { method: "POST", body: { a, b: i } });
      setLocal(res.board);
      if (!res.ok) {
        setFlash([a, i]);
        setTimeout(() => setFlash(null), 500);
      } else if (res.autoShuffled) {
        setNotice("Hết nước đi, bàn đã được trộn lại.");
        setTimeout(() => setNotice(null), 2200);
      }
    } catch (e) {
      if (!(e instanceof ClientError && e.status === 409)) setMoveError((e as Error).message);
    } finally {
      setTimeout(() => {
        setPath(null);
        setRemoving(null);
        sending.current = false;
      }, LINK_MS);
      refresh();
    }
  };

  useBoardKeys({
    rows: spec.rows,
    cols: spec.cols,
    cursor,
    setCursor,
    onPick: () => cursor !== null && pick(cursor),
    enabled: canPlay,
  });

  const leave = async () => {
    if (view?.status === "playing" && view.mode === "pvp" && !confirm("Rời trận sẽ bị xử thua. Bạn chắc chứ?")) return;
    await api(`/api/rooms/${id}/leave`, { method: "POST" }).catch(() => {});
    router.push(view?.mode === "pvp" ? "/pvp" : "/coop");
  };

  const colorOf = useMemo(() => {
    const map: Record<string, string> = {};
    view?.players.forEach((p, i) => (map[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length]));
    return map;
  }, [view?.players]);

  if (!view || !state)
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

  const maxMs = view.mode === "pvp" ? PVP.maxDurationMs : COOP.maxDurationMs;
  const left = view.startAt ? Math.max(0, view.startAt + maxMs - (view.endAt || serverNow)) : maxMs;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full max-w-4xl items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{view.mode === "pvp" ? "Đấu 1-1" : "Chơi cùng bạn"}</h1>
          <p className="text-sm font-semibold text-ink-soft">
            {view.rows}×{view.cols} · {GRAVITY_LABEL[visibleGravity(view.gravity, transposed)]}
            {view.mode === "coop" && ` · cả nhóm đã nối ${view.teamFilled}/${view.target} cặp`}
          </p>
        </div>
        <p className="text-2xl font-black tabular-nums">{formatTime(Math.ceil(left / 1000) * 1000)}</p>
      </div>

      <ul className="grid w-full max-w-4xl gap-1.5 sm:grid-cols-2">
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
                <span className="w-12 text-right text-xs font-bold tabular-nums">
                  {p.progress}/{view.target}
                </span>
              </span>
            ) : (
              <span className="text-xs font-bold text-ink-soft tabular-nums">{p.progress} cặp</span>
            )}
          </li>
        ))}
      </ul>

      {view.status === "finished" && view.result && <ResultPanel view={view} meId={user.id} />}

      <div className="relative w-full max-w-4xl">
        <Board
          rows={view.rows}
          cols={view.cols}
          cells={state.cells}
          selected={selected}
          cursor={cursor}
          flash={flash}
          path={path}
          removing={removing}
          disabled={!canPlay}
          onPick={pick}
        />
        {counting && (
          <div className="absolute inset-0 z-30 grid place-items-center rounded-2xl bg-card/85" aria-live="assertive">
            <span key={Math.ceil((view.startAt - serverNow) / 1000)} className="anim-tick text-8xl font-black">
              {Math.max(1, Math.ceil((view.startAt - serverNow) / 1000))}
            </span>
          </div>
        )}
        {notice && (
          <p className="pointer-events-none absolute inset-x-0 top-3 z-30 mx-auto w-fit rounded-full bg-ink px-4 py-1.5 text-sm font-bold text-paper" role="status">
            {notice}
          </p>
        )}
      </div>

      {view.status === "playing" && (
        <>
          <p className="max-w-md text-center text-sm text-ink-soft">
            {view.mode === "pvp"
              ? "Hai người cùng một đề. Ai xóa sạch bàn trước thì thắng; hết giờ thì ai nối được nhiều cặp hơn thắng."
              : "Cả nhóm cùng xóa một bàn. Mèo ai nối thì người đó được tính cặp."}
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
  solved: ["Bạn xóa sạch bàn trước.", "Đối thủ xóa sạch bàn trước."],
  forfeit: ["Đối thủ mất kết nối quá lâu.", "Bạn mất kết nối quá lâu."],
  left: ["Đối thủ đã rời trận.", "Bạn đã rời trận."],
  timeout: ["Hết giờ, bạn nối được nhiều cặp hơn.", "Hết giờ, đối thủ nối được nhiều cặp hơn."],
};

function ResultPanel({ view, meId }: { view: RoomView; meId: string }) {
  const r = view.result!;
  let title: string;
  let detail: string;
  let extra: string | null = null;

  if (r.mode === "pvp") {
    const won = r.winner === meId;
    title = r.winner === null ? "Hòa" : won ? "Bạn thắng!" : "Bạn thua";
    detail = r.winner === null ? "Hết giờ, hai bên nối được số cặp bằng nhau." : (PVP_REASON[r.reason]?.[won ? 0 : 1] ?? "");
    const d = r.changes[meId] ?? 0;
    extra = `${d >= 0 ? "+" : ""}${d} điểm đấu`;
  } else {
    title = r.success ? "Cả nhóm xóa sạch bàn!" : "Chưa xóa xong";
    detail = r.success ? "Không còn chú mèo nào trên bàn." : "Đã hết giờ.";
  }

  return (
    <div className="w-full max-w-md rounded-3xl bg-card p-5 text-center" role="status">
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
