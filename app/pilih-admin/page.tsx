import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAdminList } from "@/lib/admins";
import { setSelectedAdmin } from "@/lib/selectedAdmin";

export default async function PilihAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  const admins = await getAdminList();

  async function pilih(formData: FormData) {
    "use server";
    const nama = String(formData.get("admin") ?? "").trim();
    if (!nama) return;
    await setSelectedAdmin(nama);
    redirect(callbackUrl || "/");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-20">
      <div>
        <h1 className="text-title-lg text-ink-primary">Login sebagai Admin</h1>
        <p className="mt-2 text-body-md text-ink-secondary">
          Masuk sebagai <span className="font-medium text-ink-primary">{session?.user?.email}</span>. Pilih Atmin
          mana yang ingin ditampilkan datanya untuk pemfilteran.
        </p>
      </div>

      {admins.length === 0 ? (
        <p className="rounded-[var(--radius-sm)] border border-status-warning/40 bg-status-warning/10 px-4 py-2.5 text-body-md text-status-warning">
          Belum ada daftar Atmin yang bisa dipilih (cek CONTROLLER_SHEET_URL di .env.local).
        </p>
      ) : (
        <form action={pilih} className="flex flex-col gap-4">
          <select
            name="admin"
            required
            defaultValue=""
            className="rounded-[var(--radius-sm)] border border-hairline bg-background px-3 py-2.5 text-body-md text-ink-primary focus:border-info-border focus:outline-none"
            style={{ height: 44 }}
          >
            <option value="" disabled>
              Pilih admin...
            </option>
            {admins.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="btn-primary"
          >
            Lanjut ke Dashboard
          </button>
        </form>
      )}
    </div>
  );
}
