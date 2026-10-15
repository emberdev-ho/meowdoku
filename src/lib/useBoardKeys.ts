"use client";
import { useEffect, useRef } from "react";

type Handlers = {
  size: number;
  selected: number | null;
  setSelected: (i: number) => void;
  /** Giống bấm vào ô: trống → X → mèo → trống. */
  onTap: () => void;
  onToggleMark?: () => void;
  onPlace?: () => void;
  onClear?: () => void;
  onUndo?: () => void;
  enabled?: boolean;
};

/**
 * Điều khiển bằng bàn phím: mũi tên di chuyển, Space như bấm vào ô, Enter đặt/gỡ mèo,
 * X đánh dấu, Backspace xóa ô, Ctrl+Z hoàn tác.
 */
export function useBoardKeys(h: Handlers) {
  const ref = useRef(h);
  ref.current = h;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { size, selected, setSelected, onTap, onToggleMark, onPlace, onClear, onUndo, enabled = true } = ref.current;
      if (!enabled) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        onUndo?.();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const mv = moves[e.key];
      if (mv) {
        e.preventDefault();
        const cur = selected ?? 0;
        const r = (Math.floor(cur / size) + mv[0] + size) % size;
        const c = ((cur % size) + mv[1] + size) % size;
        setSelected(r * size + c);
        return;
      }
      // Các phím còn lại chỉ có tác dụng khi bàn đã có ô được chọn và không đang bấm nút khác.
      if (selected === null || target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "SELECT") return;
      if (e.key === " ") {
        e.preventDefault();
        onTap();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onPlace?.();
      } else if (e.key.toLowerCase() === "x") {
        onToggleMark?.();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        onClear?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
