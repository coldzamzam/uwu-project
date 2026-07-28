import { classifySeverity, TIER_LABEL } from "@uwu/core/severity";
import type { SeverityTier } from "@uwu/core/severity";

export const TIER_STYLES: Record<SeverityTier, { text: string; bg: string; dot: string }> = {
  hijau: { text: "text-status-good", bg: "bg-status-good/10", dot: "bg-status-good" },
  kuning: { text: "text-status-warning", bg: "bg-status-warning/15", dot: "bg-status-warning" },
  oranye: { text: "text-[#a8460a]", bg: "bg-status-serious/15", dot: "bg-status-serious" },
  merah: { text: "text-status-critical", bg: "bg-status-critical/10", dot: "bg-status-critical" },
};

/** Pil kecil berisi nilai persen + warna tingkat keparahan - dipakai di sel
 * tabel. Warna bukan satu-satunya sinyal: angka & label tier selalu tetap
 * terlihat sebagai teks. */
export function SeverityValue({
  value,
  polarity = "higherIsBetter",
}: {
  value: number | null;
  polarity?: "higherIsBetter" | "higherIsWorse";
}) {
  if (value == null) return <span className="text-ink-muted">-</span>;
  const tier = classifySeverity(value, polarity);
  const s = TIER_STYLES[tier];
  return (
    <span className={`inline-flex min-w-[3.5rem] items-center justify-center rounded-[var(--radius-sm)] px-2 py-1 text-xs font-semibold tabular-nums ${s.bg} ${s.text}`}>
      {value}%
    </span>
  );
}

export function SeverityLegend() {
  const tiers: SeverityTier[] = ["hijau", "kuning", "oranye", "merah"];
  const RANGE_LABEL: Record<SeverityTier, string> = {
    hijau: "100%",
    kuning: "70%–<100%",
    oranye: "30%–<70%",
    merah: "0%–<30%",
  };
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-secondary">
      {tiers.map((tier) => {
        const s = TIER_STYLES[tier];
        return (
          <span key={tier} className="inline-flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
            <span className={`font-semibold ${s.text}`}>{TIER_LABEL[tier]}</span>
            <span className="text-ink-muted">
              {RANGE_LABEL[tier]}
            </span>
          </span>
        );
      })}
    </div>
  );
}
