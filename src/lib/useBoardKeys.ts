"use client";
import { useEffect, useRef } from "react";

type Handlers = {
  size: number;
  selected: number | null;
  setSelected: (i: number) => void;
  onInput: (v: number) => void;
  onErase?: () => void;
  onUndo?: () => void;
  onToggleNotes?: () => void;
  enabled?: boolean;
};

/** Điều khiển bằng bàn phím: 1–9 đặt mèo, mũi tên di chuyển, Backspace xóa, N ghi chú, Ctrl+Z hoàn tác. */
export function useBoardKeys(h: Handlers) {
  const ref = useRef(h);
  ref.current = h;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { size, selected, setSelected, onInput, onErase, onUndo, onToggleNotes, enabled = true } = ref.current;
      if (!enabled) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        onUndo?.();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= size) {
        e.preventDefault();
        onInput(n);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        onErase?.();
        return;
      }
      if (e.key.toLowerCase() === "n") {
        onToggleNotes?.();
        return;
      }
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
