import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { auth, signOut } from "@/lib/auth";
import { getSelectedAdmin } from "@/lib/selectedAdmin";

export const metadata: Metadata = {
  title: "Monitoring Fasilitator Revitalisasi Sekolah (v2)",
  description: "Dashboard pemantauan kinerja fasilitator program revitalisasi sekolah - sumber data 30 LK Fasil individual.",
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
      <body className="min-h-full flex flex-col bg-background text-ink-primary">
        <header className="sticky top-0 z-50 border-b border-hairline bg-background/95 backdrop-blur-sm" style={{ height: 64 }}>
          <div className="mx-auto flex h-full max-w-[1280px] items-center gap-8 px-6 lg:px-12">
            <Link href="/" className="text-body-md font-medium text-ink-primary">
              Monitoring Fasilitator <span className="text-ink-muted font-normal">v2</span>
            </Link>
            <nav className="flex gap-5 text-body-md text-ink-secondary">
              <Link href="/" className="transition-colors hover:text-ink-primary">
                Dashboard
              </Link>
              <Link href="/analisis-massal" className="transition-colors hover:text-ink-primary">
                Analisis Massal
              </Link>
            </nav>
            {session?.user && (
              <div className="ml-auto flex items-center gap-4 text-body-md text-ink-secondary">
                {selectedAdmin && (
                  <Link href="/pilih-admin" className="transition-colors hover:text-ink-primary" title="Ganti admin">
                    Admin: <span className="font-medium text-ink-primary">{selectedAdmin}</span>
                  </Link>
                )}
                <span className="text-ink-muted">{session.user.email}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button type="submit" className="text-link transition-colors hover:text-link-active">
                    Keluar
                  </button>
                </form>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8 lg:px-12">{children}</main>
      </body>
    </html>
  );
}
