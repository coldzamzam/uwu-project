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
    <div className="flex flex-col gap-10">
      {/* Editorial Header Band */}
      <section className="border-b border-hairline pb-8 pt-2">
        <div className="max-w-4xl">
          <span className="inline-block rounded-[var(--radius-sm)] bg-surface-soft border border-hairline px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
            Progres Dokumen · Hari ke-{todayHari}
          </span>
          <h1 className="text-3xl sm:text-[36px] font-normal leading-[1.2] tracking-tight text-ink-primary">
            Progres Verifikasi Dokumen Admin & Teknis
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-secondary max-w-3xl font-normal">
            Pantau kondisi terkini tiap fasilitator.
          </p>
        </div>
      </section>

      {/* Cream Callout Card for Acuan Warna */}
      <section className="rounded-[var(--radius-md)] border border-[#e8dac5] bg-[#f5e9d4] p-6 text-[#181d26]">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#181d26]/80">Acuan Warna & Tingkat Kelengkapan</p>
        </div>
        <SeverityLegend />
      </section>

      {/* Pipeline Funnels */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DocumentProgressFunnel rows={currentRows} kategori="Admin" />
        <DocumentProgressFunnel rows={currentRows} kategori="Teknis" />
      </section>

      {/* Detailed Matrix */}
      <section className="border-t border-hairline pt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-title-md font-normal text-ink-primary">Rincian Progres Per Fasilitator</h2>
            <p className="text-xs text-ink-muted">Klik judul kolom untuk mengurutkan persentase verifikasi.</p>
          </div>
          <span className="text-xs font-medium text-ink-secondary bg-surface-soft px-3 py-1 rounded-[var(--radius-sm)] border border-hairline">
            Total {currentRows.length} Fasilitator
          </span>
        </div>
        <DocumentProgressTable rows={currentRows} hari={todayHari} />
      </section>
    </div>
  );
}
