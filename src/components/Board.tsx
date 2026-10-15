"use client";
import { useEffect, useState } from "react";
import type { Gravity, Point } from "@/lib/onet";
import { Tile, tileName } from "./CatIcon";

/**
 * Bàn ngang (nhiều cột hơn hàng) trên điện thoại dựng đứng thì xoay 90° để ô không quá nhỏ.
 * Chỉ đổi cách hiển thị: hàng của bàn thành cột trên màn hình, luật chơi giữ nguyên.
 */
export function useTransposed(rows: number, cols: number): boolean {
  const [transposed, setTransposed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px) and (orientation: portrait)");
    const update = () => setTransposed(mq.matches && cols > rows);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [rows, cols]);
  return transposed;
}

const TRANSPOSED_GRAVITY: Record<Gravity, Gravity> = {
  none: "none",
  down: "right",
  up: "left",
  left: "up",
  right: "down",
  splitH: "splitV",
  joinH: "joinV",
  splitV: "splitH",
  joinV: "joinH",
};

/** Kiểu dồn theo hướng người chơi nhìn thấy: bàn xoay thì "dồn xuống" của bàn thành "dồn phải" trên màn hình. */
export function visibleGravity(g: Gravity, transposed: boolean): Gravity {
  return transposed ? TRANSPOSED_GRAVITY[g] : g;
}

type Props = {
  rows: number;
  cols: number;
  cells: number[];
  selected: number | null;
  /** Ô đang được bàn phím trỏ tới. */
  cursor?: number | null;
  /** Cặp ô gợi ý. */
  hint?: number[] | null;
  /** Ô vừa chọn sai (không nối được), rung lên. */
  flash?: number[] | null;
  /** Đường nối đang vẽ và cặp ô đang biến mất. */
  path?: Point[] | null;
  removing?: number[] | null;
  disabled?: boolean;
  onPick: (idx: number) => void;
};

export function Board({ rows, cols, cells, selected, cursor, hint, flash, path, removing, disabled, onPick }: Props) {
  const transposed = useTransposed(rows, cols);
  const dRows = transposed ? cols : rows;
  const dCols = transposed ? rows : cols;
  // Thứ tự ô theo cách hiển thị: ô (r, c) trên màn hình ứng với ô nào của bàn.
  const order = Array.from({ length: dRows * dCols }, (_, k) => {
    const r = Math.floor(k / dCols);
    const c = k % dCols;
    return transposed ? c * cols + r : r * cols + c;
  });

  // Tọa độ SVG: mỗi ô rộng 1 đơn vị, bàn cách mép nửa ô để vẽ được đường đi vòng ngoài viền.
  const axis = (v: number, n: number) => (v < 0 ? 0.25 : v >= n ? n + 0.75 : v + 1);
  const points = path
    ?.map(([r, c]) => (transposed ? [c, r] : [r, c]))
    .map(([r, c]) => `${axis(c, dCols)},${axis(r, dRows)}`)
    .join(" ");

  return (
    <div
      className="relative mx-auto select-none"
      style={{ aspectRatio: `${dCols + 1} / ${dRows + 1}`, width: `min(100%, calc(68dvh * ${(dCols + 1) / (dRows + 1)}))` }}
    >
      <div className="absolute inset-0 rounded-2xl bg-board" aria-hidden />
      <div
        role="grid"
        aria-label={`Bàn ${rows}×${cols}`}
        aria-disabled={disabled}
        className="absolute grid"
        style={{
          inset: `${50 / (dRows + 1)}% ${50 / (dCols + 1)}%`,
          gridTemplateColumns: `repeat(${dCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${dRows}, minmax(0, 1fr))`,
        }}
      >
        {order.map((i) => {
          const kind = cells[i];
          if (!kind) return <span key={i} role="gridcell" aria-label="Ô trống" />;
          const isSel = i === selected;
          const isHint = hint?.includes(i);
          const isGone = removing?.includes(i);
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-selected={isSel}
              aria-label={`Hàng ${Math.floor(i / cols) + 1}, cột ${(i % cols) + 1}: ${tileName(kind)}`}
              disabled={disabled}
              onClick={() => onPick(i)}
              className={`relative p-[4%] transition-[transform,opacity] duration-200 ${isSel ? "z-10 -translate-y-[6%]" : ""} ${
                isGone ? "scale-50 opacity-0" : ""
              } ${flash?.includes(i) ? "anim-shake" : ""}`}
            >
              <Tile
                kind={kind}
                className={`${isSel ? "outline-[3px] outline-yarn outline-solid" : ""} ${isHint ? "anim-hint outline-[3px] outline-honey outline-solid" : ""} ${
                  i === cursor && !isSel ? "outline-2 outline-ink outline-dashed" : ""
                }`}
              />
            </button>
          );
        })}
      </div>
      {points && (
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" viewBox={`0 0 ${dCols + 1} ${dRows + 1}`} preserveAspectRatio="none" aria-hidden>
          <polyline points={points} fill="none" stroke="var(--yarn)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
