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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-title-lg text-ink-primary">Perbandingan Antar Fasilitator</h1>
        <p className="mt-1 text-body-md text-ink-secondary">
          Kondisi terkini (per Hari ke-{todayHari}) tiap fasilitator untuk satu metrik, dipilih dari dropdown di
          bawah. Ini beneran berbeda-beda per fasilitator (beda dari tren per-hari, yang datar karena angka di sheet
          belum berubah antar hari). Warna selalu berarti sama: hijau = baik, kuning = perlu diperhatikan, merah =
          bermasalah - berapapun arah angka aslinya (ada metrik yang baik itu 100%, ada yang baik itu 0%).
        </p>
      </div>
      <MetricComparisonChart rows={currentRows} />
    </div>
  );
}
