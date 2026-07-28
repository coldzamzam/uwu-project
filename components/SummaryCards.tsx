import type { DaySummary } from "@uwu/core/metrics";
import { StatTile } from "./StatTile";

export function SummaryCards({ summary }: { summary: DaySummary }) {
  const hasBelumLogin = summary.belumLogin > 0;
  const hasRisikoTinggi = summary.tinggiCount > 0;

  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
      <StatTile 
        label="Total Fasilitator" 
        value={String(summary.totalFasilitator)} 
        variant="cream"
      />
      <StatTile
        label="Belum Login LK"
        value={String(summary.belumLogin)}
        tone={hasBelumLogin ? "warning" : "default"}
        variant={hasBelumLogin ? "peach" : "soft"}
      />
      <StatTile
        label="Rata-rata Nilai Risiko"
        value={summary.avgRisiko != null ? `${summary.avgRisiko.toFixed(1)}%` : "-"}
        variant="mint"
      />
      <StatTile
        label="Fasilitator Risiko Tinggi"
        value={String(summary.tinggiCount)}
        tone={hasRisikoTinggi ? "critical" : "default"}
        variant={hasRisikoTinggi ? "coral" : "soft"}
      />
    </div>
  );
}
