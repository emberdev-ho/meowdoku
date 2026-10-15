"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "@/components/Board";
import { LeaderboardList } from "@/components/LeaderboardList";
import { NumberPad } from "@/components/NumberPad";
import { RequireUser, useSession } from "@/components/SessionProvider";
import { Stars } from "@/components/Stars";
import { api, formatTime, type LeaderEntry, type PublicLevel, type User } from "@/lib/client";
import { chunkFile, chunkOf, isValidLevelId } from "@/lib/config";
import { boxOf, findConflicts, parseGrid } from "@/lib/sudoku";
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

type Snapshot = { values: number[]; notes: number[] };

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

export default function LevelPage() {
  const { id } = useParams<{ id: string }>();
  const levelId = Number(id);
  if (!isValidLevelId(levelId)) return <p className="py-16 text-center text-ink-soft">Không có màn này.</p>;
  return <RequireUser>{(user) => <Game key={levelId} levelId={levelId} user={user} />}</RequireUser>;
}

function Game({ levelId, user }: { levelId: number; user: User }) {
  const router = useRouter();
  const { refresh, showDigits } = useSession();
  const [level, setLevel] = useState<PublicLevel | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<number[]>([]);
  const [notes, setNotes] = useState<number[]>([]);
  const [hinted, setHinted] = useState<boolean[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [hints, setHints] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [best, setBest] = useState<{ time: number; stars: number } | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);

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
      const grid = parseGrid(lvl.grid);
      setLevel(lvl);
      setToken(s.token);
      setBest(s.best);
      setValues(grid);
      setNotes(new Array(grid.length).fill(0));
      setHinted(new Array(grid.length).fill(false));
      setHistory([]);
      setHints(0);
      setSelected(grid.findIndex((v) => v === 0));
      setStartedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [levelId]);

  useEffect(() => {
    start();
  }, [start]);

  const size = level?.size ?? 9;
  const givens = useMemo(() => (level ? parseGrid(level.grid).map((v) => v > 0) : []), [level]);
  const conflicts = useMemo(() => findConflicts(values, size), [values, size]);
  const editable = (i: number | null): i is number => i !== null && !!level && !givens[i] && !hinted[i] && !result;

  const pushHistory = () => setHistory((h) => [...h.slice(-99), { values, notes }]);

  const input = (v: number) => {
    if (!editable(selected)) return;
    const i = selected;
    pushHistory();
    if (notesMode) {
      if (values[i]) return;
      setNotes((n) => n.map((m, k) => (k === i ? m ^ (1 << (v - 1)) : m)));
      return;
    }
    const nextVal = values[i] === v ? 0 : v;
    setValues((vals) => vals.map((x, k) => (k === i ? nextVal : x)));
    if (nextVal) {
      // Xóa ghi chú cùng loại mèo ở các ô cùng hàng, cột, khối.
      const r = Math.floor(i / size);
      const c = i % size;
      const b = boxOf(size, r, c);
      const bit = 1 << (nextVal - 1);
      setNotes((n) =>
        n.map((m, k) => {
          if (k === i) return 0;
          const kr = Math.floor(k / size);
          const kc = k % size;
          return kr === r || kc === c || boxOf(size, kr, kc) === b ? m & ~bit : m;
        }),
      );
    }
  };

  const erase = () => {
    if (!editable(selected)) return;
    pushHistory();
    const i = selected;
    setValues((vals) => vals.map((x, k) => (k === i ? 0 : x)));
    setNotes((n) => n.map((m, k) => (k === i ? 0 : m)));
  };

  const undo = () => {
    const last = history.at(-1);
    if (!last || result) return;
    setValues(last.values);
    setNotes(last.notes);
    setHistory((h) => h.slice(0, -1));
  };

  const hint = async () => {
    if (!token || result || busy) return;
    setBusy(true);
    try {
      const h = await api<{ idx: number; value: number; hints: number; token: string }>(`/api/levels/${levelId}/hint`, {
        method: "POST",
        body: { token, board: values.join("") },
      });
      setToken(h.token);
      setHints(h.hints);
      setValues((vals) => vals.map((x, k) => (k === h.idx ? h.value : x)));
      setNotes((n) => n.map((m, k) => (k === h.idx ? 0 : m)));
      setHinted((hs) => hs.map((x, k) => (k === h.idx ? true : x)));
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
    onInput: input,
    onErase: erase,
    onUndo: undo,
    onToggleNotes: () => setNotesMode((m) => !m),
    enabled: !!level && !result,
  });

  // Tự nộp khi bàn đầy và không còn xung đột.
  useEffect(() => {
    if (!level || !token || result || submitted.current) return;
    if (values.length === 0 || values.some((v) => v === 0) || conflicts.size > 0) return;
    submitted.current = true;
    setBusy(true);
    api<SubmitResult>(`/api/levels/${levelId}/submit`, { method: "POST", body: { token, board: values.join("") } })
      .then((r) => {
        setResult(r);
        refresh();
      })
      .catch((e: Error) => {
        submitted.current = false;
        setError(e.message);
      })
      .finally(() => setBusy(false));
  }, [values, conflicts, level, token, result, levelId, refresh]);

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

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-[min(92vw,540px)] items-center justify-between">
        <div>
          <Link href="/play" className="text-sm font-semibold text-ink-soft hover:text-ink">
            ‹ Bản đồ màn
          </Link>
          <h1 className="text-2xl font-black tracking-tight">Màn {levelId}</h1>
        </div>
        <div className="text-right">
          <Timer startedAt={startedAt} stoppedAt={result ? startedAt + result.timeMs : null} />
          <p className="text-xs font-semibold text-ink-soft">
            {best ? `Kỷ lục ${formatTime(best.time)}` : "Chưa có kỷ lục"}
            {hints > 0 && ` · ${hints} gợi ý`}
          </p>
        </div>
      </div>

      <Board
        size={size}
        values={values}
        givens={givens}
        locked={hinted}
        selected={selected}
        onSelect={setSelected}
        conflicts={conflicts}
        notes={notes}
        showDigits={showDigits}
      />

      <NumberPad size={size} values={values} onInput={input} showDigits={showDigits} disabled={!!result} />

      <div className="grid w-full max-w-[min(92vw,540px)] grid-cols-4 gap-2">
        <Tool label="Hoàn tác" onClick={undo} disabled={history.length === 0 || !!result} />
        <Tool label="Xóa" onClick={erase} disabled={!editable(selected) || (!values[selected] && !notes[selected])} />
        <Tool label={notesMode ? "Ghi chú: bật" : "Ghi chú"} onClick={() => setNotesMode((m) => !m)} active={notesMode} disabled={!!result} />
        <Tool label="Gợi ý" onClick={hint} disabled={busy || !!result} />
      </div>

      {error && <p className="text-sm font-semibold text-bad-ink">{error}</p>}

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

function Tool({ label, onClick, disabled, active }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-xl px-2 py-2.5 text-sm font-bold transition disabled:opacity-35 ${active ? "bg-ink text-paper" : "bg-card"}`}
    >
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
