import { getFacilRowsForSelectedAdmin, getTodayHari } from "@/lib/sheet";
import { getFacilitators } from "@uwu/core/metrics";
import { buildSystemicReport, renderSystemicReportText } from "@uwu/core/systemicReport";
import { StatTile } from "@/components/StatTile";
import { ReportActions } from "@/components/ReportActions";
import { NotifyPanel } from "@/components/NotifyPanel";

export default async function LaporanPage() {
  const rows = await getFacilRowsForSelectedAdmin();
  const todayHari = await getTodayHari();
  const totalFasilitator = getFacilitators(rows).length;
  const report = buildSystemicReport(rows, todayHari, totalFasilitator);
  const text = renderSystemicReportText(report);

  const hasUnfilledRisiko = report.nilaiRisikoTerisi === 0;
  const hasUniform = report.uniformColumns.length > 0;
  const totalMismatch = report.lkAplikasiMismatchRate.reduce((a, b) => a + b.affected, 0);

  return (
    <div className="flex flex-col gap-10">
      {/* Editorial Header Band */}
      <section className="border-b border-hairline pb-8 pt-2">
        <div className="max-w-4xl">
          <span className="inline-block rounded-[var(--radius-sm)] bg-surface-soft border border-hairline px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
            Pemeriksaan Pusat · Hari ke-{todayHari}
          </span>
          <h1 className="text-3xl sm:text-[36px] font-normal leading-[1.2] tracking-tight text-ink-primary">
            Laporan Masalah Data Sistemik
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-secondary max-w-3xl font-normal">
            Ringkasan siap-kirim untuk tim data pusat dan pengelola Aplikasi Revit. Berisi analisis anomali berskala program (bukan kesalahan individu fasilitator) yang dihitung live saat modul dijalankan.
          </p>
        </div>
      </section>

      {/* Demo-Grid Cluster - Signature Pastels */}
      <section className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <StatTile 
          label="Nilai Risiko Terisi" 
          value={`${report.nilaiRisikoTerisi} / ${report.totalBaris} baris`} 
          tone={hasUnfilledRisiko ? "critical" : "default"} 
          variant={hasUnfilledRisiko ? "coral" : "cream"}
        />
        <StatTile 
          label="Belum Login LK" 
          value={`${report.neverLoggedInCount} Fasil`} 
          variant="peach" 
        />
        <StatTile 
          label="Kolom Nilai Seragam (Stagnan)" 
          value={`${report.uniformColumns.length} Kolom`} 
          tone={hasUniform ? "warning" : "default"} 
          variant={hasUniform ? "yellow" : "mint"}
        />
        <StatTile
          label="Mismatch LK vs Aplikasi"
          value={`${totalMismatch} Kasus Total`}
          variant="mint"
        />
      </section>

      {/* Report Editor Rail */}
      <section className="flex flex-col gap-4 border-t border-hairline pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-title-sm font-semibold text-ink-primary">Dokumen Laporan Siap Unduh / Salin</h2>
          <ReportActions text={text} filename={`laporan-sistemik-hari-${todayHari}.txt`} />
        </div>

        <div className="rounded-[var(--radius-lg)] border border-hairline bg-[#181d26] p-6 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4 text-xs font-mono text-white/70">
            <span>TERMINAL LOG · SYSTEMIC INSPECTION</span>
            <span>UTF-8 · TEXT REPORT</span>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#f8fafc]">
            {text}
          </pre>
        </div>
      </section>

      <section className="border-t border-hairline pt-8">
        <NotifyPanel />
      </section>
    </div>
  );
}
