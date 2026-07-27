"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LkAplikasiRow } from "@uwu/core/anomalies";

export function LkAplikasiTable({ rows }: { rows: LkAplikasiRow[] }) {
  const router = useRouter();
  const inconsistent = rows.filter((r) => !r.konsisten);
  const total = rows.length;

  return (
    <div>
      {total > 0 && inconsistent.length / total >= 0.8 && (
        <div className="mb-4 rounded-[var(--radius-sm)] border border-status-warning/40 bg-status-warning/10 px-4 py-2.5 text-body-md text-status-warning">
          {inconsistent.length} dari {total} baris tidak konsisten untuk indikator yang sama - kemungkinan besar ini
          masalah sistemik (kolom sisi Aplikasi belum terisi di seluruh program), bukan {inconsistent.length} masalah
          fasilitator yang terpisah.
        </div>
      )}
      <div className="card-lg overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-body-md">
          <thead className="bg-surface-soft text-left text-[10px] uppercase text-ink-muted">
            <tr className="border-b border-hairline font-semibold">
              <th className="px-3.5 py-2.5">Fasilitator</th>
              <th className="px-3.5 py-2.5">Indikator</th>
              <th className="px-3.5 py-2.5 text-right">Hasil LK</th>
              <th className="px-3.5 py-2.5 text-right">Aplikasi</th>
              <th className="px-3.5 py-2.5 text-right">Selisih</th>
              <th className="px-3.5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r, i) => (
              <tr
                key={i}
                onClick={() => router.push(`/fasilitator/${r.kodeFasil}`)}
                className="cursor-pointer transition-colors hover:bg-surface-soft"
              >
                <td className="px-3.5 py-2.5">
                  <Link
                    href={`/fasilitator/${r.kodeFasil}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-link hover:text-link-active"
                  >
                    {r.namaFasil}
                  </Link>
                </td>
                <td className="px-3.5 py-2.5 text-ink-secondary">{r.label}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">{r.lk != null ? `${r.lk}%` : "-"}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">{r.aplikasi != null ? `${r.aplikasi}%` : "-"}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">{r.selisih != null ? `${r.selisih}` : "-"}</td>
                <td className="px-3.5 py-2.5">
                  {r.konsisten ? (
                    <span className="text-status-good font-medium">Konsisten</span>
                  ) : (
                    <span className="text-status-critical font-medium">Tidak konsisten</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
