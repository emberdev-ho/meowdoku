"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "@/lib/client";

type Session = {
  user: User | null;
  error: string | null;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
  showDigits: boolean;
  setShowDigits: (v: boolean) => void;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDigits, setShowDigitsState] = useState(true);

  useEffect(() => {
    api<User>("/api/session", { method: "POST" })
      .then(setUser)
      .catch((e: Error) => setError(e.message));
    try {
      if (localStorage.getItem("md_digits") === "0") setShowDigitsState(false);
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>("/api/me"));
    } catch {}
  }, []);

  const setShowDigits = (v: boolean) => {
    setShowDigitsState(v);
    try {
      localStorage.setItem("md_digits", v ? "1" : "0");
    } catch {}
  };

  return <Ctx.Provider value={{ user, error, refresh, setUser, showDigits, setShowDigits }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession phải nằm trong SessionProvider");
  return s;
}

/** Hiển thị nội dung khi đã có người chơi; trước đó hiện trạng thái tải hoặc lỗi. */
export function RequireUser({ children }: { children: (user: User) => ReactNode }) {
  const { user, error } = useSession();
  if (error)
    return (
      <p className="mx-auto max-w-md px-4 py-16 text-center text-ink-soft">
        Không kết nối được máy chủ: {error}
      </p>
    );
  if (!user) return <p className="py-16 text-center text-ink-soft">Đang gọi mèo…</p>;
  return <>{children(user)}</>;
}
