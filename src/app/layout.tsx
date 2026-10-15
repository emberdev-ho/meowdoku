import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Meowdoku",
  description: "Sudoku với mèo thay cho số. 3000 màn, đấu 1-1 và giải cùng bạn bè.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8eaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#161931" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-dvh antialiased">
        <SessionProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 pt-6 pb-16">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
