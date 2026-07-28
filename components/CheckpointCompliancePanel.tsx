import type { CheckpointCompliance, IndicatorCompliance } from "@uwu/core/compliance";
import type { CheckpointGroup } from "@uwu/core/knowledge/checkpoints";
import { indicatorSeverity, clampToNonHijau, TIER_LABEL, TIER_RANK } from "@uwu/core/severity";
import type { SeverityTier } from "@uwu/core/severity";
import { TIER_STYLES } from "./SeverityBadge";

const STATUS_LABEL = { sesuai: "Sesuai", "belum-sesuai": "Belum sesuai", unknown: "Tidak ada data" } as const;
const NEUTRAL_STATUS_STYLE = { dot: "bg-status-unknown", text: "text-ink-muted" };

/** Nilai indikator persentase (mis. "89.47%") diwarnai per tingkat keparahan
 * 4-tingkat (Hijau/Kuning/Oranye/Merah, lihat lib/severity.ts) - BUKAN
 * otomatis merah cuma karena statusnya "violation"/gagal target. Target
 * checkpoint di sini memang persis 100% (biner), jadi mis. 89.47% tetap
 * "Belum Sesuai" secara status, tapi warnanya harus Kuning (dekat target),
 * bukan disamaratakan semerah indikator yang benar-benar 0%. Untuk indikator
 * yang masih "violation" (`clampHijau`), tier hijau di-floor ke kuning -
 * lihat clampToNonHijau. */
function IndicatorValue({
  ind,
  group,
  fallbackClass,
  clampHijau = false,
}: {
  ind: IndicatorCompliance;
  group: CheckpointGroup;
  fallbackClass: string;
  clampHijau?: boolean;
}) {
  const tier = indicatorSeverity(ind, group);
  if (!tier) return <span className={`font-semibold ${fallbackClass}`}>{ind.detail}</span>;
  const activeTier = clampHijau ? clampToNonHijau(tier) : tier;
  const s = TIER_STYLES[activeTier];
  return (
    <>
      <span className={`font-semibold ${s.text}`}>{ind.detail}</span>
      <span className={`ml-1 text-[10px] font-bold uppercase tracking-wide ${s.text}`}>[{TIER_LABEL[activeTier]}]</span>
    </>
  );
}

/** Warna badge status checkpoint (dot + teks) - untuk "belum-sesuai", dipakai
 * tingkat keparahan TERBURUK di antara indikator gating yang violation, BUKAN
 * selalu merah. Enum tanpa gradasi (mis. "Fasil Belum Login LK" = "Belum")
 * dianggap merah (tidak ada versi "dekat tapi belum" untuk kolom begitu).
 * Hijau di-floor ke kuning (clampToNonHijau) - badge "Belum Sesuai" tidak
 * boleh pernah tampil hijau, itu klaim "sudah oke" yang salah. */
function statusStyle(status: CheckpointCompliance["status"], violations: IndicatorCompliance[], group: CheckpointGroup) {
  if (status !== "belum-sesuai") {
    return status === "sesuai" ? TIER_STYLES.hijau : NEUTRAL_STATUS_STYLE;
  }
  let worst: SeverityTier | null = null;
  for (const v of violations) {
    const tier = clampToNonHijau(indicatorSeverity(v, group) ?? "merah");
    if (worst === null || TIER_RANK[tier] > TIER_RANK[worst]) worst = tier;
  }
  return TIER_STYLES[worst ?? "merah"];
}

function SourceTag({ source }: { source: IndicatorCompliance["sumberData"] }) {
  if (!source) return null;
  const isLk = source === "LK Fasil";
  return (
    <span
      className={`mt-0.5 inline-block shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isLk ? "bg-series-5/10 text-series-5" : "bg-series-1/10 text-series-1"
      }`}
    >
      {isLk ? "LK" : "Aplikasi"}
    </span>
  );
}

/** Menampilkan nilai LK dan Aplikasi berdampingan kalau indikator ini punya
 * pasangan sungguhan di kolom lain - supaya tidak cuma satu sisi yang terlihat. */
function ComparisonNote({ ind }: { ind: IndicatorCompliance }) {
  if (!ind.counterpart) return null;
  const { counterpart } = ind;
  const lk = ind.sumberData === "LK Fasil" ? ind.detail : counterpart.value != null ? `${counterpart.value}%` : "-";
  const aplikasi = ind.sumberData === "Aplikasi Revit" ? ind.detail : counterpart.value != null ? `${counterpart.value}%` : "-";
  return (
    <span className="text-ink-muted">
      {" "}
      (Hasil LK: <span className="font-medium text-ink-secondary">{lk}</span> · Aplikasi:{" "}
      <span className="font-medium text-ink-secondary">{aplikasi}</span>
      {counterpart.selisih != null && !counterpart.konsisten && (
        <span className="font-semibold text-status-warning"> · selisih {counterpart.selisih} poin ⚠</span>
      )}
      )
    </span>
  );
}

export function CheckpointCompliancePanel({ compliance, todayHari }: { compliance: CheckpointCompliance[]; todayHari: number }) {
  if (compliance.length === 0) {
    return (
      <div className="card p-5 text-body-md text-ink-muted">
        Belum ada checkpoint yang jatuh tempo sampai Hari ke-{todayHari}.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {compliance.map(({ group, status, indicators, kendala, kendalaMismatch }) => {
        const violations = indicators.filter((i) => i.gating && i.status === "violation");
        const unknowns = indicators.filter((i) => i.gating && i.status === "unknown");
        const info = indicators.filter((i) => !i.gating);
        const s = statusStyle(status, violations, group);
        return (
          <div key={group.no} className="card flex flex-col p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body-md font-semibold text-ink-primary">
                {group.no}. {group.name}
                <span className="ml-2 text-xs font-normal text-ink-muted">jatuh tempo Hari {group.activeFromDay}</span>
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-semibold ${s.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
                {STATUS_LABEL[status]}
              </span>
            </div>

            {kendalaMismatch && (
              <div className="mt-2 rounded-[var(--radius-sm)] bg-status-warning/10 px-2.5 py-2 text-xs font-medium text-status-warning">
                ⚠ Aplikasi bilang tidak ada masalah, tapi hasil wawancara LK ke sekolah melaporkan kendala nyata - status
                diturunkan jadi &ldquo;Tidak ada data&rdquo; sampai dicek manual, bukan otomatis dipercaya &ldquo;Sesuai&rdquo;.
              </div>
            )}

            {violations.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-2 text-xs text-ink-secondary">
                {violations.map((v) => (
                  <li key={v.kolom} className="flex items-start gap-1.5">
                    <SourceTag source={v.sumberData} />
                    <span>
                      {v.label}: <IndicatorValue ind={v} group={group} fallbackClass="text-status-critical" clampHijau />
                      <ComparisonNote ind={v} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {unknowns.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-2 text-xs text-ink-muted">
                {unknowns.map((v) => (
                  <li key={v.kolom} className="flex items-start gap-1.5">
                    <SourceTag source={v.sumberData} />
                    <span>
                      {v.label}: <span className="font-semibold text-ink-secondary">{v.detail}</span>
                      {v.note && <span> - {v.note}</span>}
                      <ComparisonNote ind={v} />
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {info.length > 0 && (
              <div className="mt-2.5 border-t border-hairline pt-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Info &amp; pembanding</p>
                <ul className="flex flex-col gap-2 text-xs text-ink-secondary">
                  {info.map((v) => (
                    <li key={v.kolom} className="flex items-start gap-1.5">
                      <SourceTag source={v.sumberData} />
                      <span>
                        {v.label}: <IndicatorValue ind={v} group={group} fallbackClass="text-ink-primary" />
                        <ComparisonNote ind={v} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {kendala && (
              <div className="mt-2.5 rounded-[var(--radius-sm)] border border-hairline bg-surface-soft px-3 py-2.5 text-xs text-ink-secondary">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-primary">{kendala.label} (LK)</span>
                  {kendala.isIssue && (
                    <span className="rounded-[var(--radius-xs)] bg-status-critical/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-status-critical">
                      tersirat: Belum
                    </span>
                  )}
                </div>
                {kendala.text ?? (
                  <span className="italic text-ink-muted">
                    Tidak ada catatan kendala tercatat dari LK untuk ini - status di atas murni dari sisi lain.
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
