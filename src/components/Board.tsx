"use client";
import { boxDims, boxOf } from "@/lib/sudoku";
import { CatIcon, CATS } from "./CatIcon";

type Props = {
  size: number;
  values: number[];
  givens: boolean[];
  selected: number | null;
  onSelect: (idx: number) => void;
  conflicts?: Set<number>;
  notes?: number[]; // bitmask ghi chú cho từng ô
  flash?: number | null; // ô vừa điền sai
  ownerColor?: (idx: number) => string | undefined; // co-op: màu người điền
  locked?: boolean[]; // ô không sửa được (gợi ý hoặc đã được server xác nhận)
  showDigits: boolean;
};

export function Board({ size, values, givens, selected, onSelect, conflicts, notes, flash, ownerColor, locked, showDigits }: Props) {
  const [br, bc] = boxDims(size);
  const selR = selected !== null ? Math.floor(selected / size) : -1;
  const selC = selected !== null ? selected % size : -1;
  const selB = selected !== null ? boxOf(size, selR, selC) : -1;
  const selV = selected !== null ? values[selected] : 0;
  const [nr, nc] = size === 9 ? [3, 3] : size === 6 ? [2, 3] : [2, 2];

  return (
    <div
      role="grid"
      aria-label={`Bàn ${size}×${size}`}
      className="grid w-full max-w-[min(92vw,540px)] select-none overflow-hidden rounded-xl border-[3px] border-grid-bold bg-card"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
    >
      {values.map((v, i) => {
        const r = Math.floor(i / size);
        const c = i % size;
        const isSel = i === selected;
        const isPeer = !isSel && selected !== null && (r === selR || c === selC || boxOf(size, r, c) === selB);
        const isSame = !isSel && selV > 0 && v === selV;
        const bad = conflicts?.has(i) || flash === i;
        const owner = ownerColor?.(i);

        let bg = givens[i] ? "bg-given" : "bg-card";
        if (isPeer) bg = "bg-peer";
        if (isSame) bg = "bg-same";
        if (isSel) bg = "bg-select";
        if (bad) bg = "bg-bad";

        const thickRight = (c + 1) % bc === 0 && c < size - 1;
        const thickBottom = (r + 1) % br === 0 && r < size - 1;

        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            aria-selected={isSel}
            aria-label={`Hàng ${r + 1}, cột ${c + 1}: ${v ? `mèo ${CATS[v - 1].name} (${v})` : "trống"}${givens[i] ? ", có sẵn" : ""}`}
            onClick={() => onSelect(i)}
            className={`relative aspect-square ${bg} transition-colors duration-100 focus-visible:z-10 ${flash === i ? "anim-shake" : ""}`}
            style={{
              borderRight: c < size - 1 ? `${thickRight ? 3 : 1}px solid var(${thickRight ? "--grid-bold" : "--grid-thin"})` : undefined,
              borderBottom: r < size - 1 ? `${thickBottom ? 3 : 1}px solid var(${thickBottom ? "--grid-bold" : "--grid-thin"})` : undefined,
              boxShadow: owner ? `inset 0 0 0 3px ${owner}` : undefined,
            }}
          >
            {v > 0 ? (
              <span key={`${i}-${v}`} className={`absolute inset-[9%] block ${givens[i] || locked?.[i] ? "" : "anim-pop"}`}>
                <CatIcon value={v} className="h-full w-full" label="" />
                {showDigits && (
                  <span
                    className={`absolute -right-[4%] -bottom-[6%] text-[clamp(8px,2.2vw,12px)] leading-none font-extrabold ${
                      givens[i] ? "text-ink" : "text-yarn"
                    }`}
                  >
                    {v}
                  </span>
                )}
              </span>
            ) : notes && notes[i] ? (
              <span
                className="absolute inset-[6%] grid place-items-center"
                style={{ gridTemplateColumns: `repeat(${nc}, 1fr)`, gridTemplateRows: `repeat(${nr}, 1fr)` }}
              >
                {Array.from({ length: size }, (_, k) =>
                  notes[i] & (1 << k) ? (
                    <span key={k} className="h-[70%] w-[70%]">
                      <CatIcon value={k + 1} className="h-full w-full opacity-80" label="" />
                    </span>
                  ) : (
                    <span key={k} />
                  ),
                )}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
