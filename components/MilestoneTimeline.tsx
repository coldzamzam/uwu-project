import { CHECKPOINT_GROUPS } from "@/lib/knowledge/checkpoints";
import type { CheckpointCompliance, IndicatorCompliance } from "@/lib/compliance";

type SimpleStatus = "sesuai" | "belum-sesuai" | "unknown";

const STATUS_LABEL: Record<CheckpointCompliance["status"], string> = {
  sesuai: "Sesuai",
  "belum-sesuai": "Belum sesuai",
  unknown: "Tidak ada data",
};

const STATUS_DOT: Record<SimpleStatus | "future", string> = {
  sesuai: "border-status-good bg-status-good text-white",
  "belum-sesuai": "border-status-critical bg-status-critical text-white",
  unknown: "border-status-unknown bg-status-unknown text-white",
  future: "border-dashed border-baseline bg-surface text-ink-muted",
};

const STATUS_TEXT_SM: Record<SimpleStatus, string> = {
  sesuai: "text-status-good",
  "belum-sesuai": "text-status-critical",
  unknown: "text-ink-muted",
};

function parsePercent(detail: string): number | null {
  const m = detail.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function statusFromPercent(value: number | null): SimpleStatus {
  if (value == null) return "unknown";
  return value === 0 ? "sesuai" : "belum-sesuai";
}

type Row =
  | { kind: "checkpoint"; group: (typeof CHECKPOINT_GROUPS)[number] }
  | { kind: "marker"; day: number; variant: "today" | "viewed" };

/** Urutan baris: 14 checkpoint apa adanya (sudah urut per activeFromDay),
 * disisipi penanda "Hari ini"/"Sedang dilihat" tepat di posisi hari yang
 * sesuai - tanpa perlu hitung posisi piksel/persen sama sekali. */
function buildRows(todayHari: number, viewedHari: number): Row[] {
  const markers: { day: number; variant: "today" | "viewed" }[] = [{ day: todayHari, variant: "today" }];
  if (viewedHari !== todayHari) markers.push({ day: viewedHari, variant: "viewed" });
  markers.sort((a, b) => a.day - b.day);

  const rows: Row[] = [];
  let mi = 0;
  for (const g of CHECKPOINT_GROUPS) {
    while (mi < markers.length && markers[mi].day < g.activeFromDay) {
      rows.push({ kind: "marker", ...markers[mi] });
      mi++;
    }
    rows.push({ kind: "checkpoint", group: g });
  }
  while (mi < markers.length) {
    rows.push({ kind: "marker", ...markers[mi] });
    mi++;
  }
  return rows;
}

function MarkerRow({ day, variant }: { day: number; variant: "today" | "viewed" }) {
  const isToday = variant === "today";
  return (
    <div className="relative z-10 flex items-center gap-2.5 py-1">
      <div className="flex w-5 shrink-0 justify-center">
        <div className={`h-2 w-2 rounded-full ${isToday ? "bg-series-1" : "border-2 border-ink-secondary bg-surface"}`} />
      </div>
      <span className={`shrink-0 text-[10px] font-semibold ${isToday ? "text-series-1" : "text-ink-secondary"}`}>
        {isToday ? "Hari ini" : "Dilihat"} · H{day}
      </span>
      <div className={`h-px flex-1 ${isToday ? "bg-series-1/40" : "border-t border-dashed border-ink-secondary/50"}`} aria-hidden />
    </div>
  );
}

function CheckpointRow({
  group,
  entry,
}: {
  group: (typeof CHECKPOINT_GROUPS)[number];
  entry: CheckpointCompliance | undefined;
}) {
  const pairInd: IndicatorCompliance | undefined = entry?.indicators.find((ind) => ind.gating && ind.counterpart);
  const statusKey: CheckpointCompliance["status"] | "future" = entry ? entry.status : "future";
  const violationCount = entry?.indicators.filter((i) => i.gating && i.status === "violation").length ?? 0;
  const kendalaIssue = entry?.kendala?.isIssue;

  let split: { lkVal: number | null; aplikasiVal: number | null } | null = null;
  if (pairInd && pairInd.counterpart) {
    const rawVal = parsePercent(pairInd.detail);
    const counterpartVal = pairInd.counterpart.value;
    split =
      pairInd.sumberData === "LK Fasil" ? { lkVal: rawVal, aplikasiVal: counterpartVal } : { lkVal: counterpartVal, aplikasiVal: rawVal };
  }

  return (
    <div className="relative z-10 flex items-start gap-2.5 py-1" title={group.tujuan}>
      <div className="flex w-5 shrink-0 justify-center pt-0.5">
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold ${
            split ? "border-border bg-surface text-ink-secondary" : STATUS_DOT[statusKey]
          }`}
        >
          {group.no}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 py-0.5 text-xs leading-tight">
        <span className="font-medium text-ink-primary">{group.name}</span>
        <span className="text-[10px] text-ink-muted">H{group.activeFromDay}·b{group.bobotTotal}</span>

        {split ? (
          <>
            <span className={`font-medium ${STATUS_TEXT_SM[statusFromPercent(split.lkVal)]}`}>
              LK {split.lkVal != null ? `${split.lkVal}%` : "-"}
            </span>
            <span className={`font-medium ${STATUS_TEXT_SM[statusFromPercent(split.aplikasiVal)]}`}>
              App {split.aplikasiVal != null ? `${split.aplikasiVal}%` : "-"}
            </span>
          </>
        ) : (
          <span className={`font-medium ${entry ? STATUS_TEXT_SM[entry.status === "unknown" ? "unknown" : entry.status] : "text-ink-muted"}`}>
            {entry ? STATUS_LABEL[entry.status] : "Belum jatuh tempo"}
          </span>
        )}

        {violationCount > 0 && <span className="text-[10px] text-status-critical">({violationCount} indikator)</span>}
        {kendalaIssue && (
          <span className="rounded bg-status-critical/10 px-1 py-0.5 text-[9px] font-semibold uppercase text-status-critical">
            ada kendala LK
          </span>
        )}
      </div>
    </div>
  );
}

export function MilestoneTimeline({
  compliance,
  todayHari,
  viewedHari,
}: {
  compliance: CheckpointCompliance[];
  todayHari: number;
  viewedHari: number;
}) {
  const rows = buildRows(todayHari, viewedHari);

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-primary">Milestone</h2>
        <span className="text-[10px] text-ink-muted">arahkan kursor ke node untuk tujuan checkpoint</span>
      </div>

      <div className="relative">
        <div className="absolute left-2.5 top-0 bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-gridline" aria-hidden />
        <div className="flex flex-col">
          {rows.map((row) =>
            row.kind === "marker" ? (
              <MarkerRow key={`marker-${row.variant}`} day={row.day} variant={row.variant} />
            ) : (
              <CheckpointRow key={row.group.no} group={row.group} entry={compliance.find((c) => c.group.no === row.group.no)} />
            )
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 border-t border-gridline pt-2 text-[9px] text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-good" /> Sesuai
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-critical" /> Belum sesuai
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-unknown" /> Tidak ada data
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-dashed border-baseline" /> Belum jatuh tempo
        </span>
      </div>
    </div>
  );
}
