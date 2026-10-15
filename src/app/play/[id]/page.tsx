"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board, type Cell, type MarkMode } from "@/components/Board";
import { CatIcon } from "@/components/CatIcon";
import { LeaderboardList } from "@/components/LeaderboardList";
import { RequireUser, useSession } from "@/components/SessionProvider";
import { Stars } from "@/components/Stars";
import { api, formatTime, type LeaderEntry, type PublicLevel, type User } from "@/lib/client";
import { SOLO, chunkFile, chunkOf, isValidLevelId } from "@/lib/config";
import { conflictsWith, findConflicts, parseRegions } from "@/lib/puzzle";
import { useBoardKeys } from "@/lib/useBoardKeys";

type SubmitResult = {
  timeMs: number;
  stars: number;
  hints: number;
  firstClear: boolean;
  newBest: boolean;
  bestTime: number;
  rank: number | null;
  top: LeaderEntry[];
  nextLevel: number | null;
};

type HintResult = { kind: "place" | "remove"; idx: number; hints: number; token: string };

const chunkCache = new Map<number, Promise<PublicLevel[]>>();
function loadLevel(id: number): Promise<PublicLevel | undefined> {
  const c = chunkOf(id);
  let p = chunkCache.get(c);
  if (!p) {
    p = fetch(`/levels/${chunkFile(c)}`).then((r) => {
      if (!r.ok) throw new Error("Không tải được dữ liệu màn.");
      return r.json().then((d) => d.levels as PublicLevel[]);
    });
    chunkCache.set(c, p);
  }
  return p.then((levels) => levels.find((l) => l.id === id));
}

const catsOf = (cells: Cell[]) => cells.flatMap((v, i) => (v === 2 ? [i] : []));

export default function LevelPage() {
  const { id } = useParams<{ id: string }>();
  const levelId = Number(id);
  if (!isValidLevelId(levelId)) return <p className="py-16 text-center text-ink-soft">Không có màn này.</p>;
  return <RequireUser>{(user) => <Game key={levelId} levelId={levelId} user={user} />}</RequireUser>;
}

function Game({ levelId, user }: { levelId: number; user: User }) {
  const router = useRouter();
  const { refresh } = useSession();
  const [level, setLevel] = useState<PublicLevel | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [locked, setLocked] = useState<boolean[]>([]);
  const [history, setHistory] = useState<Cell[][]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hearts, setHearts] = useState<number>(SOLO.hearts);
  const [flash, setFlash] = useState<number[] | null>(null);
  const [hints, setHints] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [best, setBest] = useState<{ time: number; stars: number } | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const start = useCallback(async () => {
    setError(null);
    setResult(null);
    submitted.current = false;
    try {
      const lvl = await loadLevel(levelId);
      if (!lvl) throw new Error("Không có màn này.");
      const s = await api<{ token: string; best: { time: number; stars: number } | null }>(`/api/levels/${levelId}/start`, {
        method: "POST",
      });
      const n = lvl.size * lvl.size;
      const initial = Array.from({ length: n }, (_, i): Cell => (lvl.given.includes(i) ? 2 : 0));
      setLevel(lvl);
      setToken(s.token);
      setBest(s.best);
      setCells(initial);
      setLocked(initial.map((v) => v === 2));
      setHistory([]);
      setHearts(SOLO.hearts);
      setFailedAt(null);
      setFlash(null);
      setHints(0);
      setSelected(null);
      setStartedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [levelId]);

  useEffect(() => {
    start();
  }, [start]);

  const size = level?.size ?? 5;
  const regions = useMemo(() => (level ? parseRegions(level.regions) : []), [level]);
  const cats = useMemo(() => catsOf(cells), [cells]);
  const conflicts = useMemo(() => findConflicts(size, regions, cats), [size, regions, cats]);
  const failed = hearts <= 0;
  const playing = !!level && !result && !failed;
  const editable = (i: number | null): i is number => i !== null && playing && !locked[i];

  const pushHistory = () => setHistory((h) => [...h.slice(-199), cells]);
  const setCell = (i: number, v: Cell) => setCells((cs) => cs.map((x, k) => (k === i ? v : x)));

  const showFlash = (list: number[]) => {
    clearTimeout(flashTimer.current);
    setFlash(list);
    flashTimer.current = setTimeout(() => setFlash(null), 650);
  };

  /** Đặt mèo vào ô i. Vi phạm luật thì mất một tim và mèo không được đặt. */
  const placeCat = (i: number, fallback: Cell) => {
    const clash = conflictsWith(size, regions, cats, i);
    if (clash.length) {
      showFlash([i, ...clash]);
      setHearts(hearts - 1);
      if (hearts - 1 <= 0) setFailedAt(Date.now());
      setCell(i, fallback);
      return;
    }
    setCell(i, 2);
  };

  const tap = (i: number) => {
    setSelected(i);
    if (!editable(i)) return;
    pushHistory();
    if (cells[i] === 0) setCell(i, 1);
    else if (cells[i] === 1) placeCat(i, 1);
    else setCell(i, 0);
  };

  const mark = (i: number, mode: MarkMode, first: boolean) => {
    if (!playing) return;
    if (first) pushHistory();
    setCells((cs) => cs.map((x, k) => (k !== i || locked[k] ? x : mode === "mark" && x === 0 ? 1 : mode === "erase" && x === 1 ? 0 : x)));
  };

  const togglePlace = () => {
    if (!editable(selected)) return;
    pushHistory();
    if (cells[selected] === 2) setCell(selected, 0);
    else placeCat(selected, cells[selected]);
  };

  const toggleMark = () => {
    if (!editable(selected) || cells[selected] === 2) return;
    pushHistory();
    setCell(selected, cells[selected] === 1 ? 0 : 1);
  };

  const clear = () => {
    if (!editable(selected) || cells[selected] === 0) return;
    pushHistory();
    setCell(selected, 0);
  };

  const clearMarks = () => {
    if (!playing || !cells.includes(1)) return;
    pushHistory();
    setCells((cs) => cs.map((x) => (x === 1 ? 0 : x)));
  };

  const undo = () => {
    const last = history.at(-1);
    if (!last || !playing) return;
    setCells(last);
    setHistory((h) => h.slice(0, -1));
  };

  const hint = async () => {
    if (!token || !playing || busy) return;
    setBusy(true);
    try {
      const h = await api<HintResult>(`/api/levels/${levelId}/hint`, { method: "POST", body: { token, cats } });
      setToken(h.token);
      setHints(h.hints);
      pushHistory();
      if (h.kind === "remove") {
        // Con mèo này đặt sai chỗ: gỡ ra và đánh dấu X.
        setCell(h.idx, 1);
        showFlash([h.idx]);
      } else {
        setCell(h.idx, 2);
        setLocked((ls) => ls.map((x, k) => (k === h.idx ? true : x)));
      }
      setSelected(h.idx);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useBoardKeys({
    size,
    selected,
    setSelected,
    onTap: () => selected !== null && tap(selected),
    onPlace: togglePlace,
    onToggleMark: toggleMark,
    onClear: clear,
    onUndo: undo,
    enabled: playing,
  });

  // Tự nộp khi đã đủ mèo và không có xung đột.
  useEffect(() => {
    if (!level || !token || result || failed || submitted.current) return;
    if (cats.length !== level.size || conflicts.size > 0) return;
    submitted.current = true;
    setBusy(true);
    api<SubmitResult>(`/api/levels/${levelId}/submit`, { method: "POST", body: { token, cats } })
      .then((r) => {
        setResult(r);
        refresh();
      })
      .catch((e: Error) => {
        submitted.current = false;
        setError(e.message);
      })
      .finally(() => setBusy(false));
  }, [cats, conflicts, level, token, result, failed, levelId, refresh]);

  if (error && !level)
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-bold">{error}</p>
        <Link href="/play" className="mt-4 inline-block rounded-xl bg-card px-4 py-2 font-bold">
          Về bản đồ màn
        </Link>
      </div>
    );
  if (!level) return <p className="py-16 text-center text-ink-soft">Đang bày bàn…</p>;

  const catKind = ((levelId - 1) % 9) + 1;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-[min(92vw,520px)] items-center justify-between">
        <div>
          <Link href="/play" className="text-sm font-semibold text-ink-soft hover:text-ink">
            ‹ Bản đồ màn
          </Link>
          <h1 className="text-2xl font-black tracking-tight">Màn {levelId}</h1>
        </div>
        <div className="text-right">
          <Timer startedAt={startedAt} stoppedAt={result ? startedAt + result.timeMs : failedAt} />
          <p className="text-xs font-semibold text-ink-soft">
            {best ? `Kỷ lục ${formatTime(best.time)}` : "Chưa có kỷ lục"}
            {hints > 0 && ` · ${hints} gợi ý`}
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-[min(92vw,520px)] items-center justify-between">
        <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1 font-extrabold tabular-nums" aria-label={`Đã đặt ${cats.length}/${size} mèo`}>
          <CatIcon value={catKind} className="h-6 w-6" label="" />
          {cats.length}/{size}
        </span>
        <Hearts left={hearts} />
      </div>

      <Board
        size={size}
        regions={regions}
        cells={cells}
        locked={locked}
        given={level.given}
        selected={selected}
        flash={flash}
        catKind={catKind}
        disabled={!playing}
        onTap={tap}
        onMark={mark}
      />

      <div className="grid w-full max-w-[min(92vw,520px)] grid-cols-4 gap-2">
        <Tool label="Hoàn tác" onClick={undo} disabled={history.length === 0 || !playing} />
        <Tool label="Xóa dấu X" onClick={clearMarks} disabled={!playing || !cells.includes(1)} />
        <Tool label="Gợi ý" onClick={hint} disabled={busy || !playing} />
        <Tool label="Chơi lại" onClick={start} disabled={busy} />
      </div>

      {error && <p className="text-sm font-semibold text-bad-ink">{error}</p>}

      <HowTo open={levelId <= 3} />

      {failed && !result && <FailedDialog onReplay={start} />}
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

function Hearts({ left }: { left: number }) {
  return (
    <span className="flex gap-1" aria-label={`Còn ${Math.max(0, left)}/${SOLO.hearts} tim`}>
      {Array.from({ length: SOLO.hearts }, (_, i) => (
        <svg key={`${i}-${i < left}`} viewBox="0 0 20 18" className={`h-6 w-6 ${i < left ? "" : "anim-pop"}`} aria-hidden>
          <path
            d="M10 17s-8-4.9-8-10.2C2 3.8 4.2 2 6.6 2c1.5 0 2.7.8 3.4 2 .7-1.2 1.9-2 3.4-2C15.8 2 18 3.8 18 6.8 18 12.1 10 17 10 17z"
            fill={i < left ? "var(--yarn)" : "none"}
            stroke={i < left ? "var(--yarn)" : "var(--grid-thin)"}
            strokeWidth="1.6"
          />
        </svg>
      ))}
    </span>
  );
}

function HowTo({ open }: { open: boolean }) {
  return (
    <details open={open} className="w-full max-w-[min(92vw,520px)] rounded-2xl bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-extrabold">Cách chơi</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
        <li>Mỗi hàng, mỗi cột và mỗi vùng màu có đúng một con mèo.</li>
        <li>Hai con mèo không được đứng sát nhau, kể cả chéo góc.</li>
        <li>Bấm một ô: lần 1 đánh dấu X (chắc chắn không có mèo), lần 2 đặt mèo, lần 3 xóa. Kéo qua nhiều ô để đánh X nhanh.</li>
        <li>Đặt mèo vi phạm luật sẽ mất một tim. Hết {SOLO.hearts} tim thì phải chơi lại màn.</li>
        <li>Bàn phím: mũi tên để di chuyển, Space như bấm ô, Enter đặt mèo, X đánh dấu, Ctrl+Z hoàn tác.</li>
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

function Timer({ startedAt, stoppedAt }: { startedAt: number; stoppedAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (stoppedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [stoppedAt]);
  return <p className="text-2xl font-black tabular-nums">{formatTime((stoppedAt ?? now) - startedAt)}</p>;
}

function FailedDialog({ onReplay }: { onReplay: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-4" role="dialog" aria-modal aria-labelledby="failed-title">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-2xl">
        <h2 id="failed-title" className="text-3xl font-black tracking-tight">
          Hết tim rồi
        </h2>
        <p className="mt-2 text-ink-soft">Đặt mèo vi phạm luật {SOLO.hearts} lần. Thử lại màn này nhé.</p>
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
        {result.stars < 3 && (
          <p className="mt-2 text-xs text-ink-soft">Giải nhanh hơn và không dùng gợi ý để được 3 sao.</p>
        )}

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
