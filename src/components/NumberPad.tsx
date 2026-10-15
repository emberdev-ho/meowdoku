"use client";
import { CatIcon } from "./CatIcon";

type Props = {
  size: number;
  values: number[];
  onInput: (v: number) => void;
  showDigits: boolean;
  disabled?: boolean;
};

/** Hàng chọn mèo, kèm số còn lại cần đặt của mỗi loại. */
export function NumberPad({ size, values, onInput, showDigits, disabled }: Props) {
  const counts = new Array(size + 1).fill(0);
  for (const v of values) counts[v]++;
  return (
    <div className="grid w-full max-w-[min(92vw,540px)] gap-1.5" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
      {Array.from({ length: size }, (_, k) => {
        const v = k + 1;
        const left = size - counts[v];
        return (
          <button
            key={v}
            type="button"
            disabled={disabled || left <= 0}
            onClick={() => onInput(v)}
            className="flex flex-col items-center gap-0.5 rounded-xl bg-card px-0.5 pt-1.5 pb-1 shadow-[0_2px_0_var(--grid-thin)] transition active:translate-y-px disabled:opacity-30"
            aria-label={`Đặt mèo số ${v}, còn ${left}`}
          >
            <CatIcon value={v} className="aspect-square w-full max-w-11" label="" />
            <span className="text-[11px] leading-none font-bold text-ink-soft tabular-nums">
              {showDigits ? `${v}·` : ""}
              {left}
            </span>
          </button>
        );
      })}
    </div>
  );
}
