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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-title-lg text-ink-primary">Laporan Masalah Data Sistemik</h1>
        <p className="mt-1 text-body-md text-ink-secondary">
          Ringkasan siap-kirim untuk tim data/Aplikasi Revit - masalah yang levelnya program-wide, bukan per
          fasilitator. Dihitung ulang tiap dibuka (per Hari ke-{todayHari}).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Nilai Risiko Terisi" value={`${report.nilaiRisikoTerisi}/${report.totalBaris}`} tone={report.nilaiRisikoTerisi === 0 ? "critical" : "default"} />
        <StatTile label="Belum Login LK" value={String(report.neverLoggedInCount)} />
        <StatTile label="Kolom Nilai Seragam" value={String(report.uniformColumns.length)} tone={report.uniformColumns.length > 0 ? "warning" : "default"} />
        <StatTile
          label="Pasangan LK/Aplikasi Tak Konsisten"
          value={String(report.lkAplikasiMismatchRate.reduce((a, b) => a + b.affected, 0))}
        />
      </div>

      <ReportActions text={text} filename={`laporan-sistemik-hari-${todayHari}.txt`} />

      <pre className="overflow-x-auto whitespace-pre-wrap card-lg p-6 font-mono text-xs leading-relaxed text-ink-primary">
        {text}
      </pre>

      <NotifyPanel />
    </div>
  );
}
