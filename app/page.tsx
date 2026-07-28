import Link from "next/link";
import { getFacilRowsForSelectedAdmin, getTodayHari, isUsingSampleData } from "@/lib/sheet";
import { getAvailableDays, getFacilitators, getRowsForDay, summarizeDay, groupRowsByFacilitator, getCurrentRow } from "@uwu/core/metrics";
import { getCheckpointCompliance, countNonCompliant } from "@uwu/core/compliance";
import { scanAllAnomalies } from "@uwu/core/anomalies";
import { DaySelector } from "@/components/DaySelector";
import { ModeToggle } from "@/components/ModeToggle";
import { SummaryCards } from "@/components/SummaryCards";
import { StatTile } from "@/components/StatTile";
import { AllFasilRawMatriksTable } from "@/components/AllFasilRawMatriksTable";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ hari?: string; mode?: string }>;
}) {
  const { hari: hariParam, mode: modeParam } = await searchParams;
  const mode: "alltime" | "harian" = modeParam === "harian" ? "harian" : "alltime";

  const rows = await getFacilRowsForSelectedAdmin();
  const days = getAvailableDays(rows);
  const latestDay = days[days.length - 1] ?? 1;
  const todayHari = await getTodayHari();

  const hari = mode === "harian" ? (hariParam ? parseInt(hariParam, 10) : latestDay) : todayHari;
  
  let dayRows: typeof rows;
  if (mode === "alltime") {
    const byFasil = groupRowsByFacilitator(rows);
    dayRows = Array.from(byFasil.values())
      .map((history) => getCurrentRow(history, todayHari))
      .filter((r): r is typeof rows[0] => r !== undefined);
  } else {
    dayRows = getRowsForDay(rows, hari);
  }

  const summary = summarizeDay(dayRows);

  const complianceCounts = new Map(
    dayRows.map((r) => [r.kodeFasil, countNonCompliant(getCheckpointCompliance(r, hari))])
  );
  const nonCompliantFacilCount = [...complianceCounts.values()].filter((c) => c > 0).length;
  const hariRelLabel = hari === todayHari ? "hari ini" : hari < todayHari ? "sudah lewat" : "belum terjadi";

  const anomalyReports = scanAllAnomalies(rows, todayHari);
  const firstFacilitator = getFacilitators(rows)[0] ?? null;

  return (
    <div className="flex flex-col gap-12">
      {isUsingSampleData() && (
        <div className="rounded-[var(--radius-sm)] border border-[#c89433] bg-[#f5e9d4] px-4 py-3 text-body-md font-medium text-[#181d26]">
          ⚠ Menampilkan data contoh (<code className="font-mono bg-white/60 px-1 py-0.5 rounded">fixtures/sample-sheet.csv</code>). Set <code className="font-mono bg-white/60 px-1 py-0.5 rounded">SHEET_CSV_URL</code> di <code className="font-mono bg-white/60 px-1 py-0.5 rounded">.env.local</code> untuk memakai data spreadsheet asli.
        </div>
      )}

      {/* Airtable Hero Band - Editorial Whitespace Framing */}
      <section className="border-b border-hairline pb-8 pt-4">
        <div className="max-w-4xl">
          <span className="inline-block rounded-[var(--radius-sm)] bg-surface-soft border border-hairline px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-ink-muted mb-4">
            Pemantauan & Analitika Siklus 14 Hari
          </span>
          <h1 className="text-3xl sm:text-[40px] font-normal leading-[1.2] tracking-tight text-ink-primary">
            Workspace Eksplorasi & Verifikasi Kinerja Fasilitator
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-secondary max-w-3xl font-normal">
            Pantau tingkat login, kelengkapan dokumen administrasi dan teknis, serta deteksi anomali operasional di seluruh 30 LK Fasilitator secara real-time.
          </p>
        </div>

        {/* Control Rail */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-hairline/60 bg-surface-soft/40 p-3 rounded-[var(--radius-md)]">
          <ModeToggle mode={mode} />
          {mode === "harian" && (
            <DaySelector days={days} current={hari} todayHari={todayHari} extraParams={{ mode: "harian" }} />
          )}
        </div>
      </section>

      {/* Demo-Grid Cluster - Signature Pastel Cards */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-title-sm font-semibold text-ink-primary">Ringkasan Metrik Program</h2>
          <span className="text-xs font-medium text-ink-muted">Diperbarui Live · Hari ke-{todayHari}</span>
        </div>

        <SummaryCards summary={summary} />
        
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <StatTile
            label={`Checkpoint Belum Sesuai (per Hari ${hari}, ${hariRelLabel})`}
            value={`${nonCompliantFacilCount} Fasilitator`}
            tone={nonCompliantFacilCount > 0 ? "critical" : "default"}
            variant={nonCompliantFacilCount > 0 ? "yellow" : "soft"}
          />
          <Link href="/anomali" className="block transition-transform hover:-translate-y-0.5 duration-200">
            <StatTile
              label="Fasilitator dengan Anomali (klik untuk pemeriksaan →)"
              value={`${anomalyReports.length} dari ${getFacilitators(rows).length} Fasilitator`}
              tone={anomalyReports.length > 0 ? "warning" : "default"}
              variant={anomalyReports.length > 0 ? "mustard" : "soft"}
            />
          </Link>
        </div>
      </section>

      {/* Signature Forest CTA Card - Brand Voltage Moment */}
      {firstFacilitator && (
        <section className="rounded-[var(--radius-lg)] bg-[#0a2e0e] p-8 md:p-12 text-white shadow-md my-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="max-w-2xl">
            <span className="inline-block rounded-[var(--radius-xs)] bg-[#a8d8c4] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[#0a2e0e] mb-3">
              Alur Investigasi & Analisis AI
            </span>
            <h3 className="text-2xl sm:text-3xl font-normal leading-tight tracking-tight">
              Review Mendalam Lembar Kerja Fasilitator
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/80 font-normal">
              Lakukan tinjauan kualitatif, pemeriksaan kendala sekolah, dan pembuatan kesimpulan analisis harian untuk seluruh fasilitator, dimulai dari <strong className="text-white underline decoration-[#a8d8c4] decoration-2">{firstFacilitator.namaFasil}</strong> (urut A-Z).
            </p>
          </div>
          <Link
            href={`/fasilitator/${firstFacilitator.kodeFasil}`}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-white px-7 py-4 text-base font-semibold text-[#0a2e0e] shadow-sm transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Mulai Analisis Sekarang &rarr;
          </Link>
        </section>
      )}

      {/* Matriks Data Fasil */}
      <section className="border-t border-hairline pt-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-title-lg text-ink-primary font-normal">Matriks Kinerja Keseluruhan</h2>
            <p className="text-sm text-ink-secondary">Klik nama fasilitator untuk masuk ke panel evaluasi terperinci.</p>
          </div>
          <span className="text-xs font-medium text-ink-muted bg-surface-soft px-3 py-1.5 rounded-[var(--radius-sm)] border border-hairline self-start sm:self-auto">
            Total {dayRows.length} Lembar Kerja
          </span>
        </div>
        <AllFasilRawMatriksTable rows={dayRows} />
      </section>
    </div>
  );
}
