"use client";
import { useRef } from "react";
import { CatIcon } from "./CatIcon";

/** Trạng thái một ô: 0 trống, 1 dấu X (người chơi tự đánh dấu), 2 có mèo. */
export type Cell = 0 | 1 | 2;
export type MarkMode = "mark" | "erase";

type Props = {
  size: number;
  regions: number[];
  cells: Cell[];
  selected: number | null;
  /** Ô không đổi được: mèo cho sẵn, mèo gợi ý, mèo đã được server xác nhận. */
  locked?: boolean[];
  /** Ô có mèo cho sẵn từ đề (hiện biểu tượng khóa). */
  given?: number[];
  /** Mèo đang chờ server kiểm tra. */
  pending?: Set<number>;
  /** Ô vừa vi phạm luật, rung và tô đỏ. */
  flash?: number[] | null;
  /** Con mèo nào (1–9) dùng cho bàn này. */
  catKind?: number;
  /** Co-op: màu viền theo người đặt mèo. */
  ownerColor?: (idx: number) => string | undefined;
  disabled?: boolean;
  onTap: (idx: number) => void;
  /** Kéo qua nhiều ô: đánh dấu X (hoặc xóa X nếu bắt đầu từ ô đã có X). */
  onMark: (idx: number, mode: MarkMode, first: boolean) => void;
};

export function Board({
  size,
  regions,
  cells,
  selected,
  locked,
  given,
  pending,
  flash,
  catKind = 1,
  ownerColor,
  disabled,
  onTap,
  onMark,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; last: number; mode: MarkMode; moved: boolean } | null>(null);

  const cellAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-idx]");
    if (!el || !ref.current?.contains(el)) return null;
    return Number(el.dataset.idx);
  };

  return (
    <div
      ref={ref}
      role="grid"
      aria-label={`Bàn ${size}×${size}`}
      aria-disabled={disabled}
      className="grid w-full max-w-[min(92vw,520px)] touch-none overflow-hidden rounded-xl border-[3px] border-grid-bold select-none"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        const idx = cellAt(e.clientX, e.clientY);
        if (idx === null) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { start: idx, last: idx, mode: cells[idx] === 1 ? "erase" : "mark", moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const idx = cellAt(e.clientX, e.clientY);
        if (idx === null || idx === d.last) return;
        if (!d.moved) {
          d.moved = true;
          onMark(d.start, d.mode, true);
        }
        d.last = idx;
        onMark(idx, d.mode, false);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) onTap(d.start);
      }}
      onPointerCancel={() => (drag.current = null)}
    >
      {cells.map((v, i) => {
        const r = Math.floor(i / size);
        const c = i % size;
        const g = regions[i];
        const edgeRight = c < size - 1 && regions[i + 1] !== g;
        const edgeBottom = r < size - 1 && regions[i + size] !== g;
        const owner = ownerColor?.(i);
        const shaking = flash?.includes(i);
        const label = v === 2 ? "có mèo" : v === 1 ? "đánh dấu X" : "trống";

        return (
          <button
            key={i}
            data-idx={i}
            type="button"
            role="gridcell"
            tabIndex={-1}
            aria-selected={i === selected}
            aria-label={`Hàng ${r + 1}, cột ${c + 1}, vùng ${g + 1}: ${label}${given?.includes(i) ? ", cho sẵn" : ""}`}
            // Bấm bằng bàn phím hoặc trình đọc màn hình (không có thao tác chuột).
            onClick={(e) => e.detail === 0 && !disabled && onTap(i)}
            className={`relative aspect-square ${shaking ? "anim-shake" : ""}`}
            style={{
              background: `var(--r${g % 10})`,
              borderRight: c < size - 1 ? (edgeRight ? "3px solid var(--grid-bold)" : "1px solid var(--cell-line)") : undefined,
              borderBottom: r < size - 1 ? (edgeBottom ? "3px solid var(--grid-bold)" : "1px solid var(--cell-line)") : undefined,
            }}
          >
            {shaking && <span className="absolute inset-0 bg-bad/80" aria-hidden />}
            {v === 1 && (
              <svg viewBox="0 0 10 10" className="absolute top-[32%] left-[32%] h-[36%] w-[36%]" aria-hidden>
                <path d="M2 2l6 6M8 2l-6 6" stroke="var(--mark)" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            )}
            {v === 2 && (
              <span
                className={`absolute inset-[10%] grid place-items-center rounded-full bg-card shadow-[0_2px_0_rgba(0,0,0,0.2)] ${
                  locked?.[i] ? "" : "anim-pop"
                } ${pending?.has(i) ? "opacity-50" : ""}`}
                style={owner ? { boxShadow: `0 0 0 3px ${owner}` } : undefined}
              >
                <CatIcon value={catKind} className="h-[88%] w-[88%]" label="" />
                {given?.includes(i) && (
                  <svg viewBox="0 0 12 12" className="absolute -right-[6%] -bottom-[6%] h-[38%] w-[38%]" aria-hidden>
                    <circle cx="6" cy="6" r="6" fill="var(--grid-bold)" />
                    <rect x="3.4" y="5.4" width="5.2" height="3.8" rx="0.8" fill="var(--card)" />
                    <path d="M4.4 5.4V4.4a1.6 1.6 0 0 1 3.2 0v1" stroke="var(--card)" strokeWidth="1" fill="none" />
                  </svg>
                )}
              </span>
            )}
            {i === selected && !disabled && (
              <span className="pointer-events-none absolute inset-0 ring-[3px] ring-yarn ring-inset" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}
