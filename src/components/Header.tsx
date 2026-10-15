"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./SessionProvider";
import { CatIcon } from "./CatIcon";

const LINKS = [
  { href: "/play", label: "Chơi đơn" },
  { href: "/pvp", label: "Đấu 1-1" },
  { href: "/coop", label: "Chơi cùng bạn" },
  { href: "/leaderboard", label: "Xếp hạng" },
];

export function Header() {
  const path = usePathname();
  const { user } = useSession();
  return (
    <header className="sticky top-0 z-20 border-b border-grid-thin bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-1.5 text-lg font-black tracking-tight">
          <CatIcon value={1} className="h-7 w-7" label="" />
          Meowdoku
        </Link>
        <nav className="ml-auto hidden gap-1 sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${path.startsWith(l.href) ? "bg-ink text-paper" : "hover:bg-card"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {user && (
          <span className="ml-auto truncate rounded-full bg-card px-3 py-1 text-sm font-semibold sm:ml-2" title="Tên của bạn">
            {user.name}
          </span>
        )}
      </div>
      <nav className="flex justify-around border-t border-grid-thin sm:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex-1 py-2 text-center text-xs font-bold ${path.startsWith(l.href) ? "text-yarn" : "text-ink-soft"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
