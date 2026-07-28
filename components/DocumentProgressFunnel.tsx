import type { FacilRow } from "@uwu/core/types";
import { averagePct, metricFor, type DocKategori, type DocStage } from "@uwu/core/documentProgress";
import { classifySeverity } from "@uwu/core/severity";
import { TIER_STYLES } from "./SeverityBadge";

const STAGES: DocStage[] = ["Terunggah", "Terverifikasi", "Sesuai"];

interface StageBoxData {
  stage: DocStage;
  value: number | null;
  caption: string;
}

function StageBox({ stage, value, caption, compact }: StageBoxData & { compact?: boolean }) {
  const s = value == null ? null : TIER_STYLES[classifySeverity(value, "higherIsBetter")];
  if (compact) {
    return (
      <div className={`flex-1 rounded-[var(--radius-sm)] border border-hairline px-2.5 py-2 ${s?.bg ?? "bg-background"}`}>
        <div className="text-[11px] leading-tight text-ink-secondary">{stage}</div>
        <div className={`mt-0.5 text-base font-semibold leading-tight tabular-nums ${s?.text ?? "text-ink-muted"}`}>{value == null ? "-" : `${value}%`}</div>
      </div>
    );
  }
  return (
    <div className={`flex-1 rounded-[var(--radius-md)] border border-hairline p-4 ${s?.bg ?? "bg-background"}`}>
      <div className="text-body-md text-ink-secondary">{stage}</div>
      <div className={`mt-1 text-title-lg font-medium tabular-nums ${s?.text ?? "text-ink-muted"}`}>{value == null ? "-" : `${value}%`}</div>
      <div className="mt-1 text-xs text-ink-muted">{caption}</div>
    </div>
  );
}

function StageRow({ kategori, boxes, compact }: { kategori: DocKategori; boxes: StageBoxData[]; compact?: boolean }) {
  if (compact) {
    return (
      <div className="card p-3.5">
        <h3 className="mb-2 text-xs font-semibold text-ink-primary">Dokumen {kategori}</h3>
        <div className="flex items-stretch gap-2">
          {boxes.map((b, i) => (
            <div key={b.stage} className="flex flex-1 items-stretch gap-2">
              <StageBox {...b} compact />
              {i < boxes.length - 1 && <span className="self-center text-xs text-ink-muted">→</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="card-lg p-5">
      <h3 className="mb-4 text-title-sm text-ink-primary">Dokumen {kategori}</h3>
      <div className="flex items-stretch gap-3">
        {boxes.map((b, i) => (
          <div key={b.stage} className="flex flex-1 items-stretch gap-3">
            <StageBox {...b} />
            {i < boxes.length - 1 && <span className="self-center text-ink-muted font-medium">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ringkasan pipeline dokumen (Terunggah -> Terverifikasi -> Sesuai) untuk satu
 * kategori (Admin/Teknis) - rata-rata LINTAS FASILITATOR, supaya penurunan
 * antar tahap kelihatan sekilas tanpa scroll ke tabel detail. Dipakai di
 * halaman /progres-dokumen. Untuk satu fasilitator saja, lihat
 * FacilDocumentFunnel di bawah. */
export function DocumentProgressFunnel({ rows, kategori }: { rows: FacilRow[]; kategori: DocKategori }) {
  const boxes: StageBoxData[] = STAGES.map((stage) => {
    const metric = metricFor(kategori, stage);
    const { avg, n } = averagePct(rows, metric.kolom);
    return { stage, value: avg, caption: `rata-rata dari ${n} sekolah/fasilitator` };
  });
  return <StageRow kategori={kategori} boxes={boxes} />;
}

/** Sama seperti DocumentProgressFunnel, tapi untuk SATU fasilitator (nilai
 * mentah dari baris data terkininya, bukan rata-rata lintas fasilitator) -
 * dipakai di halaman detail /fasilitator/[kode]. */
export function FacilDocumentFunnel({ row, kategori }: { row: FacilRow; kategori: DocKategori }) {
  const boxes: StageBoxData[] = STAGES.map((stage) => {
    const metric = metricFor(kategori, stage);
    const raw = row[metric.kolom];
    return { stage, value: typeof raw === "number" ? raw : null, caption: "Aplikasi Revit" };
  });
  return <StageRow kategori={kategori} boxes={boxes} compact />;
}
