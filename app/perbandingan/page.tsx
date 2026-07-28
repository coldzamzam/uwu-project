import { getFacilRowsForSelectedAdmin, getTodayHari } from "@/lib/sheet";
import { groupRowsByFacilitator, getCurrentRow } from "@uwu/core/metrics";
import { MetricComparisonChart } from "@/components/MetricComparisonChart";

export default async function PerbandinganPage() {
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
            Komparasi Real-Time · Hari ke-{todayHari}
          </span>
          <h1 className="text-3xl sm:text-[36px] font-normal leading-[1.2] tracking-tight text-ink-primary">
            Perbandingan Antar Fasilitator
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-secondary max-w-3xl font-normal">
            Analisis kondisi terkini tiap fasilitator untuk metrik spesifik yang dipilih. Warna selalu konsisten: hijau = baik, kuning = perlu diperhatikan, merah = bermasalah - menyesuaikan arah bobot dan target indikator aslinya.
          </p>
        </div>
      </section>

      {/* Comparison Workspace */}
      <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface-soft/40 p-6 sm:p-8">
        <MetricComparisonChart rows={currentRows} />
      </section>
    </div>
  );
}
