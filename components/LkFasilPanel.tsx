"use client";

import { useState } from "react";
import { LK_SUMMARY_COLUMNS } from "@/lib/facilitatorLk";

/** Kolom yang di-freeze (sticky) di kiri tabel supaya tetap kelihatan saat
 * scroll horizontal ke 43 kolom lainnya - ini konteks utama tiap baris. */
const FROZEN_COL = "Nama Sekolah";

export function LkFasilPanel({
  kodeFasil,
  hari,
  editUrl,
}: {
  kodeFasil: string;
  /** Kosongkan untuk tampilkan semua baris (semua hari), bukan hari tertentu saja. */
  hari?: number;
  editUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);

  async function load() {
    if (rows || loading) return;
    setLoading(true);
    setError(null);
    try {
      const hariQuery = typeof hari === "number" ? `&hari=${hari}` : "";
      const res = await fetch(`/api/lk-fasil?kodeFasil=${encodeURIComponent(kodeFasil)}${hariQuery}`);
      const data = await res.json();
      if (!data.available) throw new Error(data.error || "Data LK tidak tersedia.");
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data LK.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={toggle}
          className="flex items-center gap-2 text-body-md font-semibold text-ink-primary hover:text-link"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          LK Fasilitator ({typeof hari === "number" ? `Hari ${hari}` : "Semua Hari"})
        </button>
        {editUrl && (
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary !py-1 !px-3 !text-xs"
          >
            Buka Spreadsheet ↗
          </a>
        )}
      </div>

      {open && (
        <div className="mt-4">
          {loading && <p className="text-body-md text-ink-muted">Memuat data LK...</p>}
          {error && (
            <div className="rounded-[var(--radius-sm)] bg-status-warning/10 px-3.5 py-2 text-body-md text-status-warning">
              {error}
              {!editUrl && " Fasilitator ini juga belum punya link sheet LK yang terpetakan."}
            </div>
          )}
          {rows && rows.length === 0 && !error && (
            <p className="text-body-md text-ink-muted">
              Tidak ada baris sekolah {typeof hari === "number" ? `untuk Hari ${hari} ` : ""}di sheet LK ini.
            </p>
          )}
          {rows && rows.length > 0 && (
            <>
              <p className="mb-2 text-xs text-ink-muted">
                {rows.length} baris · {new Set(rows.map((r) => r["Nama Sekolah"])).size} sekolah
                {typeof hari !== "number" && " × hari yang tercatat"}.
              </p>
              <div className="max-h-[28rem] overflow-auto rounded-[var(--radius-sm)] border border-hairline">
                <table className="w-full min-w-[3600px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-soft">
                      {LK_SUMMARY_COLUMNS.map((col) => {
                        const frozen = col === FROZEN_COL;
                        return (
                          <th
                            key={col}
                            className={`sticky top-0 whitespace-nowrap border-b border-hairline px-2.5 py-2 text-left font-semibold text-ink-secondary ${
                              frozen ? "left-0 z-20 bg-surface-soft shadow-[1px_0_0_0_var(--color-hairline)]" : "z-10"
                            }`}
                          >
                            {col}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {rows.map((r, i) => (
                      <tr key={i} className="transition-colors hover:bg-surface-soft">
                        {LK_SUMMARY_COLUMNS.map((col) => {
                          const frozen = col === FROZEN_COL;
                          return (
                            <td
                              key={col}
                              className={`max-w-[200px] truncate px-2.5 py-1.5 text-ink-primary ${
                                frozen ? "sticky left-0 z-10 bg-surface shadow-[1px_0_0_0_var(--color-hairline)]" : ""
                              }`}
                              title={r[col]}
                            >
                              {r[col] || <span className="text-ink-muted">-</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Menampilkan kolom A-AQ ({LK_SUMMARY_COLUMNS.length} dari total 112 kolom LK Fasil mentah) - seluruh
            bagian wawancara kepatuhan. Kolom AR ke atas (kondisi fisik bangunan, kebutuhan rehab) beda domain,
            buka spreadsheet-nya langsung untuk lihat itu.
          </p>
        </div>
      )}
    </div>
  );
}
