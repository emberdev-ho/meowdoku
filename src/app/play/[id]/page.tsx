"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board, useTransposed, visibleGravity } from "@/components/Board";
import { LeaderboardList } from "@/components/LeaderboardList";
import { RequireUser, useSession } from "@/components/SessionProvider";
import { Stars } from "@/components/Stars";
import { api, formatTime, type LeaderEntry, type User } from "@/lib/client";
import { SOLO, isValidLevelId, levelSpec, timeLimitMs } from "@/lib/config";
import {
  GRAVITY_LABEL,
  SHUFFLE_MOVE,
  findMove,
  initialState,
  isCleared,
  playMove,
  remaining,
  shuffleBoard,
  type GameState,
  type Move,
  type Point,
} from "@/lib/onet";
import { useBoardKeys } from "@/lib/useBoardKeys";

type SubmitResult = {
  timeMs: number;
  stars: number;
  firstClear: boolean;
  newBest: boolean;
  bestTime: number;
  rank: number | null;
  top: LeaderEntry[];
  nextLevel: number | null;
};

/** Thời gian hiện đường nối trước khi hai ô biến mất. */
const LINK_MS = 220;

export default function LevelPage() {
  const { id } = useParams<{ id: string }>();
  const levelId = Number(id);
  if (!isValidLevelId(levelId)) return <p className="py-16 text-center text-ink-soft">Không có màn này.</p>;
  return <RequireUser>{(user) => <Game key={levelId} levelId={levelId} user={user} />}</RequireUser>;
}

function Game({ levelId, user }: { levelId: number; user: User }) {
  const router = useRouter();
  const { refresh } = useSession();
  const spec = useMemo(() => levelSpec(levelId), [levelId]);
  const limitMs = timeLimitMs(levelId);
  const transposed = useTransposed(spec.rows, spec.cols);
  const [state, setState] = useState<GameState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [flash, setFlash] = useState<number[] | null>(null);
  const [path, setPath] = useState<Point[] | null>(null);
  const [removing, setRemoving] = useState<number[] | null>(null);
  const [hintsLeft, setHintsLeft] = useState<number>(SOLO.hints);
  const [shufflesLeft, setShufflesLeft] = useState<number>(SOLO.shuffles);
  const [notice, setNotice] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [best, setBest] = useState<{ time: number; stars: number } | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const moves = useRef<Move[]>([]);
  const animating = useRef(false);
  const submitted = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const start = useCallback(async () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setError(null);
    setResult(null);
    submitted.current = false;
    animating.current = false;
    try {
      const s = await api<{ token: string; best: { time: number; stars: number } | null }>(`/api/levels/${levelId}/start`, {
        method: "POST",
      });
      moves.current = [];
      setToken(s.token);
      setBest(s.best);
      setState(initialState(spec));
      setSelected(null);
      setHint(null);
      setFlash(null);
      setPath(null);
      setRemoving(null);
      setNotice(null);
      setHintsLeft(SOLO.hints);
      setShufflesLeft(SOLO.shuffles);
      setTimeUp(false);
      setStartedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [levelId, spec]);

  useEffect(() => {
    start();
  }, [start]);

  const playing = !!state && !!token && !result && !timeUp && !isCleared(state);

  const showNotice = (text: string) => {
    setNotice(text);
    later(() => setNotice(null), 2200);
  };

  const pick = (i: number) => {
    if (!state || !playing || animating.current || !state.cells[i]) return;
    setCursor(i);
    setHint(null);
    if (selected === null || state.cells[selected] !== state.cells[i]) {
      setSelected(selected === i ? null : i);
      return;
    }
    if (selected === i) {
      setSelected(null);
      return;
    }
    const res = playMove(spec, state, selected, i);
    if (!res.ok) {
      // Cùng loại nhưng không nối được (đường đi rẽ quá 2 lần hoặc bị chặn).
      setFlash([selected, i]);
      later(() => setFlash(null), 500);
      setSelected(i);
      return;
    }
    moves.current.push([selected, i]);
    animating.current = true;
    setPath(res.path);
    setRemoving([selected, i]);
    setSelected(null);
    later(() => {
      setState(res.state);
      setPath(null);
      setRemoving(null);
      animating.current = false;
      if (res.autoShuffled) showNotice("Hết nước đi, bàn đã được trộn lại.");
    }, LINK_MS);
  };

  const showHint = () => {
    if (!state || !playing || hintsLeft <= 0) return;
    const m = findMove(state.cells, spec.rows, spec.cols);
    if (!m) return;
    setHint(m);
    setHintsLeft((n) => n - 1);
  };

  const shuffle = () => {
    if (!state || !playing || shufflesLeft <= 0 || animating.current) return;
    moves.current.push(SHUFFLE_MOVE);
    setState(shuffleBoard(spec, state));
    setSelected(null);
    setHint(null);
    setShufflesLeft((n) => n - 1);
  };

  useBoardKeys({
    rows: spec.rows,
    cols: spec.cols,
    cursor,
    setCursor,
    onPick: () => cursor !== null && pick(cursor),
    onHint: showHint,
    onShuffle: shuffle,
    enabled: playing,
  });

  // Hết giờ.
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setTimeUp(true), Math.max(0, startedAt + limitMs - Date.now()));
    return () => clearTimeout(t);
  }, [playing, startedAt, limitMs]);

  // Xóa sạch bàn thì nộp toàn bộ nước đi để server chơi lại và ghi kết quả.
  useEffect(() => {
    if (!state || !token || result || submitted.current || !isCleared(state)) return;
    submitted.current = true;
    setBusy(true);
    api<SubmitResult>(`/api/levels/${levelId}/submit`, { method: "POST", body: { token, moves: moves.current } })
      .then((r) => {
        setResult(r);
        refresh();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, [state, token, result, levelId, refresh]);

  if (error && !state)
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-bold">{error}</p>
        <Link href="/play" className="mt-4 inline-block rounded-xl bg-card px-4 py-2 font-bold">
          Về bản đồ màn
        </Link>
      </div>
    );
  if (!state) return <p className="py-16 text-center text-ink-soft">Đang xếp mèo…</p>;

  const pairsLeft = remaining(state) / 2;
  const total = (spec.rows * spec.cols) / 2;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full max-w-4xl items-end justify-between gap-3">
        <div>
          <Link href="/play" className="text-sm font-semibold text-ink-soft hover:text-ink">
            ‹ Bản đồ màn
          </Link>
          <h1 className="text-2xl font-black tracking-tight">Màn {levelId}</h1>
          <p className="text-xs font-semibold text-ink-soft">
            {spec.rows}×{spec.cols} · {GRAVITY_LABEL[visibleGravity(spec.gravity, transposed)]} · {best ? `Kỷ lục ${formatTime(best.time)}` : "Chưa có kỷ lục"}
          </p>
        </div>
        <div className="text-right">
          <Countdown startedAt={startedAt} limitMs={limitMs} stoppedAt={result ? startedAt + result.timeMs : timeUp ? startedAt + limitMs : null} />
          <p className="text-xs font-semibold text-ink-soft tabular-nums">
            Còn {pairsLeft}/{total} cặp
          </p>
        </div>
      </div>

      <TimeBar startedAt={startedAt} limitMs={limitMs} stopped={!playing} />

      <div className="relative w-full max-w-4xl">
        <Board
          rows={spec.rows}
          cols={spec.cols}
          cells={state.cells}
          selected={selected}
          cursor={cursor}
          hint={hint}
          flash={flash}
          path={path}
          removing={removing}
          disabled={!playing}
          onPick={pick}
        />
        {notice && (
          <p className="pointer-events-none absolute inset-x-0 top-3 z-30 mx-auto w-fit rounded-full bg-ink px-4 py-1.5 text-sm font-bold text-paper" role="status">
            {notice}
          </p>
        )}
      </div>

      <div className="grid w-full max-w-md grid-cols-3 gap-2">
        <Tool label={`Gợi ý (${hintsLeft})`} onClick={showHint} disabled={!playing || hintsLeft <= 0} />
        <Tool label={`Trộn bàn (${shufflesLeft})`} onClick={shuffle} disabled={!playing || shufflesLeft <= 0} />
        <Tool label="Chơi lại" onClick={start} disabled={busy} />
      </div>

      {error && <p className="text-sm font-semibold text-bad-ink">{error}</p>}

      <HowTo open={levelId <= 2} />

      {timeUp && !result && <TimeUpDialog onReplay={start} />}
      {result && (
        <ResultDialog
          result={result}
          levelId={levelId}
          user={user}
          onReplay={start}
          onNext={() => result.nextLevel && router.push(`/play/${result.nextLevel}`)}
        />
      )}
    </div>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Countdown({ startedAt, limitMs, stoppedAt }: { startedAt: number; limitMs: number; stoppedAt: number | null }) {
  const now = useNow(stoppedAt === null);
  const left = Math.max(0, startedAt + limitMs - (stoppedAt ?? now));
  return <p className={`text-2xl font-black tabular-nums ${left < 15000 ? "text-bad-ink" : ""}`}>{formatTime(Math.ceil(left / 1000) * 1000)}</p>;
}

function TimeBar({ startedAt, limitMs, stopped }: { startedAt: number; limitMs: number; stopped: boolean }) {
  const now = useNow(!stopped);
  const left = Math.max(0, 1 - (now - startedAt) / limitMs);
  return (
    <div className="h-2 w-full max-w-4xl overflow-hidden rounded-full bg-card" aria-hidden>
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${left < 0.25 ? "bg-bad-ink" : left < 0.5 ? "bg-honey" : "bg-good"}`}
        style={{ width: `${left * 100}%` }}
      />
    </div>
  );
}

function HowTo({ open }: { open: boolean }) {
  return (
    <details open={open} className="w-full max-w-md rounded-2xl bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-extrabold">Cách chơi</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
        <li>Bấm hai ô mèo giống hệt nhau để nối. Đường nối đi qua ô trống, rẽ tối đa 2 lần, và được vòng ra ngoài viền bàn.</li>
        <li>Nối xong hai ô biến mất. Từ màn 2, các ô còn lại dồn theo kiểu của màn (xuống, lên, sang trái…).</li>
        <li>Xóa sạch bàn trước khi hết giờ để qua màn. Còn nhiều thời gian thì được nhiều sao.</li>
        <li>Mỗi màn có {SOLO.hints} lần gợi ý và {SOLO.shuffles} lần trộn bàn. Hết nước đi thì bàn tự trộn.</li>
        <li>Bàn phím: mũi tên để di chuyển, Space chọn ô, H gợi ý, S trộn bàn.</li>
      </ul>
    </details>
  );
}

function Tool({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded-xl bg-card px-2 py-2.5 text-sm font-bold transition disabled:opacity-35">
      {label}
    </button>
  );
}

function TimeUpDialog({ onReplay }: { onReplay: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-4" role="dialog" aria-modal aria-labelledby="timeup-title">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-2xl">
        <h2 id="timeup-title" className="text-3xl font-black tracking-tight">
          Hết giờ rồi
        </h2>
        <p className="mt-2 text-ink-soft">Bàn chưa sạch mèo. Thử lại màn này nhé.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button ref={ref} onClick={onReplay} className="rounded-2xl bg-yarn py-3 text-lg font-extrabold text-yarn-ink">
            Chơi lại
          </button>
          <Link href="/play" className="rounded-2xl bg-paper py-2.5 font-bold">
            Bản đồ màn
          </Link>
        </div>
      </div>
    </div>
  );
}

function ResultDialog({
  result,
  levelId,
  user,
  onReplay,
  onNext,
}: {
  result: SubmitResult;
  levelId: number;
  user: User;
  onReplay: () => void;
  onNext: () => void;
}) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-4" role="dialog" aria-modal aria-labelledby="result-title">
      <div className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-card p-6 text-center shadow-2xl">
        <h2 id="result-title" className="text-3xl font-black tracking-tight">
          Qua màn {levelId}!
        </h2>
        <div className="anim-tick mt-3 flex justify-center">
          <Stars count={result.stars} className="h-10 w-10" />
        </div>
        <p className="mt-3 text-4xl font-black tabular-nums">{formatTime(result.timeMs)}</p>
        <p className="text-sm font-semibold text-ink-soft">
          {result.newBest && !result.firstClear ? "Kỷ lục mới của bạn" : `Kỷ lục: ${formatTime(result.bestTime)}`}
          {result.rank ? `, hạng ${result.rank} ở màn này` : ""}
        </p>
        {result.stars < 3 && <p className="mt-2 text-xs text-ink-soft">Xóa sạch bàn khi còn hơn nửa thời gian để được 3 sao.</p>}

        <div className="mt-5 flex flex-col gap-2">
          {result.nextLevel && (
            <button ref={nextRef} onClick={onNext} className="rounded-2xl bg-yarn py-3 text-lg font-extrabold text-yarn-ink">
              Màn tiếp theo
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onReplay} className="rounded-2xl bg-paper py-2.5 font-bold">
              Chơi lại
            </button>
            <Link href="/play" className="rounded-2xl bg-paper py-2.5 font-bold">
              Bản đồ màn
            </Link>
          </div>
        </div>

        <h3 className="mt-6 mb-1 text-left text-sm font-extrabold text-ink-soft">Nhanh nhất màn này</h3>
        <div className="text-left">
          <LeaderboardList
            entries={result.top}
            me={result.rank ? { rank: result.rank, score: result.bestTime } : null}
            myId={user.id}
            myName={user.name}
            format={formatTime}
            empty="Bạn là người đầu tiên qua màn này."
          />
        </div>
      </div>
    </div>
  );
}
