"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RequireUser } from "@/components/SessionProvider";
import { api } from "@/lib/client";
import { COOP } from "@/lib/config";

export default function CoopPage() {
  return <RequireUser>{() => <CoopLobby />}</RequireUser>;
}

function CoopLobby() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ id: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await fn();
      router.push(`/room/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-black tracking-tight">Chơi cùng bạn</h1>
      <p className="mt-2 text-ink-soft">
        Tối đa {COOP.maxPlayers} người giải chung một bàn 9×9. Ô nào điền đúng sẽ khóa lại. Cả nhóm sai đến lần thứ {COOP.maxMistakes} là thua.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-3xl bg-card p-5">
          <h2 className="text-lg font-extrabold">Tạo phòng mới</h2>
          <p className="mt-1 text-sm text-ink-soft">Bạn sẽ nhận mã phòng để gửi cho bạn bè.</p>
          <button
            disabled={busy}
            onClick={() => run(() => api("/api/rooms", { method: "POST" }))}
            className="mt-4 w-full rounded-2xl bg-yarn py-3 font-extrabold text-yarn-ink disabled:opacity-50"
          >
            Tạo phòng
          </button>
        </section>

        <form
          className="rounded-3xl bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api("/api/rooms/join", { method: "POST", body: { code } }));
          }}
        >
          <h2 className="text-lg font-extrabold">Vào phòng bằng mã</h2>
          <label htmlFor="code" className="mt-1 block text-sm text-ink-soft">
            Mã gồm 5 ký tự
          </label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={5}
            autoComplete="off"
            autoCapitalize="characters"
            className="mt-2 w-full rounded-xl border border-grid-thin bg-paper px-3 py-2.5 text-center text-xl font-black tracking-[0.3em] uppercase"
          />
          <button disabled={busy || code.length !== 5} className="mt-3 w-full rounded-2xl bg-ink py-3 font-extrabold text-paper disabled:opacity-40">
            Vào phòng
          </button>
        </form>
      </div>
      {error && <p className="mt-4 font-semibold text-bad-ink">{error}</p>}
    </div>
  );
}
