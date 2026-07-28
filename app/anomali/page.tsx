import Link from "next/link";
import { getFacilRowsForSelectedAdmin, getTodayHari } from "@/lib/sheet";
import { scanAllAnomalies } from "@uwu/core/anomalies";
import { getFacilitators } from "@uwu/core/metrics";
import { StatTile } from "@/components/StatTile";
import { AnomalyList } from "@/components/AnomalyList";

export default async function AnomaliPage() {
  const rows = await getFacilRowsForSelectedAdmin();
  const todayHari = await getTodayHari();
  const reports = scanAllAnomalies(rows, todayHari);
  const totalFacilitators = getFacilitators(rows).length;

  const byType = new Map<string, number>();
  for (const r of reports) for (const item of r.items) byType.set(item.type, (byType.get(item.type) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-10">
      {/* Editorial Header Band */}
      <section className="border-b border-hairline pb-8 pt-2">
        <div className="max-w-4xl">
          <span className="inline-block rounded-[var(--radius-sm)] bg-surface-soft border border-hairline px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
            Integritas & Resolusi Data · Hari ke-{todayHari}
          </span>
          <h1 className="text-3xl sm:text-[36px] font-normal leading-[1.2] tracking-tight text-ink-primary">
            Deteksi Anomali & Ketidaksesuaian Sistem
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-secondary max-w-3xl font-normal">
            Dipindai secara otomatis untuk membandingkan status login LK, konsistensi hasil LK terhadap Aplikasi Revit, catatan Kendala yang kontradiktif, dan indikasi entri data yang melewati hari aktif.
          </p>
        </div>
      </section>

      {/* Demo-Grid Pastel Cluster */}
      <section className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <StatTile
          label="Fasilitator dengan Anomali"
          value={`${reports.length} dari ${totalFacilitators}`}
          tone={reports.length > 0 ? "warning" : "default"}
          variant={reports.length > 0 ? "mustard" : "cream"}
        />
        <StatTile 
          label="Belum Login LK" 
          value={`${byType.get("never_logged_in") ?? 0} Kasus`} 
          variant="peach" 
        />
        <StatTile 
          label="LK vs Aplikasi Tak Konsisten" 
          value={`${byType.get("lk_aplikasi_mismatch") ?? 0} Kasus`} 
          variant="mint" 
        />
        <StatTile 
          label="Data Melewati Hari Ini" 
          value={`${byType.get("future_data") ?? 0} Kasus`} 
          tone={byType.get("future_data") ? "critical" : "default"} 
          variant={byType.get("future_data") ? "coral" : "yellow"}
        />
      </section>

      {(byType.get("lk_aplikasi_mismatch") ?? 0) >= totalFacilitators * 0.8 && (
        <div className="rounded-[var(--radius-md)] border border-[#c89433] bg-[#f5e9d4] p-5 text-sm leading-relaxed text-[#181d26]">
          <strong>ℹ Catatan Analitis Program-Wide:</strong> Hampir semua fasilitator mengalami indikasi &ldquo;LK vs Aplikasi tidak konsisten&rdquo; untuk indikator Perencana. Ini kemungkinan besar bukan kelalaian fasilitator individual, melainkan kolom &ldquo;% Sekolah Tidak Memiliki Perencana (Aplikasi)&rdquo; pada serverpusat yang belum selesai diselaraskan (bernilai 100% di semua baris).
        </div>
      )}

      <section className="border-t border-hairline pt-8">
        <h2 className="mb-6 text-title-md font-normal text-ink-primary">Daftar Investigasi Per Fasilitator</h2>
        {reports.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface-soft p-12 text-center text-ink-muted font-medium">
            ✓ Seluruh data bersih. Tidak ada anomali atau kontradiksi yang terdeteksi pada hari ini.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {reports.map((r) => (
              <div key={r.kodeFasil} className="rounded-[var(--radius-md)] border border-hairline bg-background p-6 transition-shadow hover:shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3.5">
                  <Link 
                    href={`/fasilitator/${r.kodeFasil}?hari=${todayHari}`} 
                    className="text-title-sm font-bold text-[#1b61c9] hover:underline"
                  >
                    {r.namaFasil} &rarr;
                  </Link>
                  <span className="rounded-[var(--radius-sm)] bg-surface-soft border border-hairline px-2.5 py-1 text-xs font-semibold text-ink-muted">
                    {r.kodeFasil}
                  </span>
                </div>
                <AnomalyList items={r.items} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
