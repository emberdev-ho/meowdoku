"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./client";

/** Gọi GET định kỳ. Dừng khi `url` là null. Lần gọi sau chỉ bắt đầu khi lần trước xong. */
export function usePoll<T>(url: string | null, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refresh = useCallback(async () => {
    if (!urlRef.current) return;
    try {
      setData(await api<T>(urlRef.current));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [url, intervalMs, refresh]);

  return { data, error, refresh };
}
