import { getFacilRowsForSelectedAdmin, getTodayHari } from "@/lib/sheet";
import { groupRowsByFacilitator, getCurrentRow } from "@uwu/core/metrics";
import { DocumentProgressFunnel } from "@/components/DocumentProgressFunnel";
import { DocumentProgressTable } from "@/components/DocumentProgressTable";
import { SeverityLegend } from "@/components/SeverityBadge";

export default async function ProgresDokumenPage() {
  const rows = await getFacilRowsForSelectedAdmin();
  const todayHari = await getTodayHari();

  const byFasil = groupRowsByFacilitator(rows);
  const currentRows = [...byFasil.values()]
    .map((history) => getCurrentRow(history, todayHari))
    .filter((r): r is NonNullable<typeof r> => !!r);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-title-lg text-ink-primary">Progres Dokumen</h1>
        <p className="mt-1 text-body-md text-ink-secondary">
          Kondisi terkini (per Hari ke-{todayHari}) tiap fasilitator, supaya penurunan persentase dari dokumen yang
          sekadar terunggah sampai yang benar-benar dinyatakan sesuai kelihatan jelas per tahap - baik untuk Dokumen
          Admin maupun Dokumen Teknis.
        </p>
      </div>

      <div className="card p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Acuan warna</p>
        <SeverityLegend />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DocumentProgressFunnel rows={currentRows} kategori="Admin" />
        <DocumentProgressFunnel rows={currentRows} kategori="Teknis" />
      </div>

      <DocumentProgressTable rows={currentRows} hari={todayHari} />
    </div>
  );
}
