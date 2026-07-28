import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { auth, signOut } from "@/lib/auth";
import { getSelectedAdmin } from "@/lib/selectedAdmin";

export const metadata: Metadata = {
  title: "Monitoring Fasilitator Revitalisasi Sekolah (v2) · Airtable Workspace",
  description: "Dashboard pemantauan kinerja fasilitator program revitalisasi sekolah - sumber data 30 LK Fasil individual dalam desain Airtable Editorial.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const selectedAdmin = session ? await getSelectedAdmin() : null;

  return (
    <html lang="id" className="h-full" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-ink-primary font-sans antialiased selection:bg-[#a8d8c4] selection:text-[#0a2e0e]">
        {/* Airtable Editorial Top-Nav (64px white canvas, zero scrollbar) */}
        <header className="sticky top-0 z-50 border-b border-hairline bg-background/95 backdrop-blur-md" style={{ minHeight: 64 }}>
          <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-6 lg:px-12">
            <div className="flex items-center gap-6 lg:gap-8">
              <Link href="/" className="flex items-center gap-2.5 text-body-lg font-bold tracking-tight text-ink-primary whitespace-nowrap shrink-0">
                Monitoring Fasilitator
              </Link>

              {/* Desktop Nav - Clean spacing, NO scrollbars, "Lainnya" dropdown for compact layout */}
              <nav className="hidden md:flex items-center gap-6 text-body-md font-medium text-ink-secondary">
                <Link href="/" className="transition-colors hover:text-ink-primary">
                  Dashboard
                </Link>
                <Link href="/progres-dokumen" className="transition-colors hover:text-ink-primary">
                  Progres Dokumen
                </Link>
                <Link href="/analisis-massal" className="transition-colors hover:text-ink-primary">
                  Analisis Massal
                </Link>

                {/* Dropdown "Lainnya" untuk item tambahan tanpa membuang ruang atau memicu scrollbar */}
                <div className="relative group py-2">
                  <button type="button" className="flex items-center gap-1.5 text-ink-secondary hover:text-ink-primary font-medium focus:outline-none">
                    <span>Lainnya</span>
                    <span className="text-[10px] text-ink-muted group-hover:rotate-180 transition-transform">▾</span>
                  </button>
                  <div className="absolute left-0 top-full hidden w-52 rounded-[var(--radius-md)] border border-hairline bg-background py-2 shadow-lg group-hover:block z-50">
                    <Link href="/anomali" className="flex items-center gap-2 px-3.5 py-2 text-sm text-ink-secondary hover:bg-surface-soft hover:text-ink-primary transition-colors font-medium">
                      <span>Deteksi Anomali</span>
                    </Link>
                  </div>
                </div>
              </nav>
            </div>

            {/* Right Cluster - Admin Info & Log Out */}
            {session?.user && (
              <div className="flex shrink-0 items-center gap-3 text-body-md text-ink-secondary">
                {selectedAdmin && (
                  <Link 
                    href="/pilih-admin" 
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-hairline bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink-primary transition-colors hover:bg-slate-100 max-w-[150px] sm:max-w-none truncate" 
                    title="Ganti admin yang dipilih"
                  >
                    <span className="text-ink-muted hidden sm:inline">Admin:</span> <strong className="font-semibold text-[#181d26] truncate">{selectedAdmin}</strong>
                  </Link>
                )}
                <span className="hidden xl:inline-block text-xs text-ink-muted">{session.user.email}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button 
                    type="submit" 
                    className="rounded-[var(--radius-sm)] border border-hairline bg-background px-3 py-1 text-xs font-medium text-ink-primary transition-colors hover:bg-surface-soft hover:text-[#181d26]"
                  >
                    Keluar
                  </button>
                </form>
              </div>
            )}
          </div>
        </header>

        {/* Responsive Mobile Nav - Flex Wrap TANPA scrollbar horizontal */}
        <nav className="md:hidden flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-hairline bg-surface-soft px-6 py-2.5 text-xs font-medium text-ink-secondary">
          <Link href="/" className="hover:text-ink-primary">Dashboard</Link>
          <Link href="/progres-dokumen" className="hover:text-ink-primary">Progres Dokumen</Link>
          <Link href="/analisis-massal" className="hover:text-ink-primary">Analisis Massal</Link>
          <Link href="/anomali" className="hover:text-ink-primary">Anomali</Link>
        </nav>

        {/* Main Workspace Canvas */}
        <main className="mx-auto w-full max-w-[1360px] flex-1 px-6 py-10 lg:px-12 lg:py-12">{children}</main>

        {/* Airtable Editorial Footer - Bebas dari link yang dinonaktifkan (Perbandingan & Laporan Sistemik) */}
        <footer className="border-t border-hairline bg-surface-soft mt-24">
          <div className="mx-auto max-w-[1360px] px-6 py-6 lg:px-12">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-ink-muted font-medium">
              <div>© 2026 Tim Fasil 13 Revitalisasi Sekolah</div>
              <div className="flex gap-4">
                <span>Versi 2.1.2</span>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
