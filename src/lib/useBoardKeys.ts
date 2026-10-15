"use client";
import { useEffect, useRef } from "react";

type Handlers = {
  rows: number;
  cols: number;
  cursor: number | null;
  setCursor: (i: number) => void;
  /** Chọn ô đang trỏ (như bấm chuột). */
  onPick: () => void;
  onHint?: () => void;
  onShuffle?: () => void;
  enabled?: boolean;
};

/** Điều khiển bằng bàn phím: mũi tên di chuyển, Space hoặc Enter chọn ô, H gợi ý, S trộn bàn. */
export function useBoardKeys(h: Handlers) {
  const ref = useRef(h);
  ref.current = h;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { rows, cols, cursor, setCursor, onPick, onHint, onShuffle, enabled = true } = ref.current;
      if (!enabled || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT", "A"].includes(target.tagName) || target.isContentEditable) return;
      // Đang trỏ vào một nút khác ngoài bàn thì để nút đó tự xử lý Space/Enter.
      const onBoardButton = target.tagName === "BUTTON" && target.getAttribute("role") === "gridcell";
      if (target.tagName === "BUTTON" && !onBoardButton && (e.key === " " || e.key === "Enter")) return;

      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const mv = moves[e.key];
      if (mv) {
        e.preventDefault();
        const cur = cursor ?? 0;
        const r = (Math.floor(cur / cols) + mv[0] + rows) % rows;
        const c = ((cur % cols) + mv[1] + cols) % cols;
        setCursor(r * cols + c);
      } else if ((e.key === " " || e.key === "Enter") && cursor !== null) {
        e.preventDefault();
        onPick();
      } else if (e.key.toLowerCase() === "h") {
        onHint?.();
      } else if (e.key.toLowerCase() === "s") {
        onShuffle?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
