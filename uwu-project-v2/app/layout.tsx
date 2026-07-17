import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monitoring Fasilitator Revitalisasi Sekolah (v2)",
  description: "Dashboard pemantauan kinerja fasilitator program revitalisasi sekolah - sumber data 30 LK Fasil individual.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-ink-primary">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3">
            <Link href="/" className="text-sm font-semibold">
              Monitoring Fasilitator <span className="text-ink-muted">v2</span>
            </Link>
            <nav className="flex gap-4 text-sm text-ink-secondary">
              <Link href="/" className="hover:text-ink-primary">
                Dashboard
              </Link>
              <Link href="/analisis-massal" className="hover:text-ink-primary">
                Analisis Massal
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
