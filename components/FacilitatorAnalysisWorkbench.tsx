"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { FacilRow } from "@uwu/core/types";
import { QUALITATIVE_FIELDS, type NoteRange } from "@uwu/core/notes";
import { KEY_TO_HEADER } from "@uwu/core/columns";
import { KENDALA_ACTIVE_FROM_DAY, classifyKendalaText } from "@uwu/core/compliance";
import type { CheckpointCompliance } from "@uwu/core/compliance";
import { classifySeverity } from "@uwu/core/severity";
import { findIndicator } from "@uwu/core/knowledge/checkpoints";
import { buildFacilitatorCopyPromptText } from "@uwu/core/prompts";
import { TIER_STYLES } from "./SeverityBadge";
import { InfoTooltip } from "./InfoTooltip";
import { FacilDocumentFunnel } from "./DocumentProgressFunnel";

const KENDALA_FIELDS = QUALITATIVE_FIELDS.filter((f) => f.key !== "analisis" && f.key !== "catatanAdmin" && f.key !== "jumlahSekolahMengundurkanDiri");

function fieldValue(row: FacilRow, key: keyof FacilRow): string {
  const v = row[key];
  if (typeof v !== "string" || v === "Belum Diisi") return "";
  return v;
}

/** Slot Log (1/2) dianggap PUNYA data kalau baris-nya ada DAN Skor Akhir-nya
 * terisi - baris masterLog bisa saja "ada" secara objek (Tanggal/Nama
 * Fasil/Hari ke- sudah terisi otomatis oleh sheet) padahal fasil belum
 * benar-benar mengisi log itu, seluruh kolom skornya masih kosong. Skor
 * Akhir dipakai sebagai penanda karena itu kolom rollup akhir dari SEMUA
 * checkpoint (lihat buildFacilRowFromMasterLog di lib/masterSheet.ts) - kalau
 * itu kosong (null), log tsb belum benar-benar diisi, BUKAN cuma "belum
 * masuk jam log-nya" (waktu tidak dipakai sama sekali di sini, murni cek ada
 * tidaknya data). */
function hasLogData(row: FacilRow | null | undefined): boolean {
  return row != null && row.skorAkhir != null;
}

function defaultLogSource(dayLogs?: { log1: FacilRow | null; log2: FacilRow | null } | null): "log1" | "log2" {
  return hasLogData(dayLogs?.log2) ? "log2" : "log1";
}

/** "aman" (hijau) = tidak ada kendala nyata, "belum-diisi" (kuning) = fasilitator
 * belum menanggapi padahal checkpoint sudah jatuh tempo (gap administratif,
 * belum tentu ada masalah lapangan), "ada-kendala" (merah) = laporan masalah
 * nyata dari lapangan, "netral" (abu) = checkpoint terkait belum jatuh tempo. */
type KendalaState = "aman" | "belum-diisi" | "ada-kendala" | "netral";

interface KendalaDisplay {
  text: string;
  state: KendalaState;
  /** true kalau `text` teks sintetis buatan UI (bukan isi asli sel sheet) - dipakai buat gaya italic. */
  isPlaceholder: boolean;
  /** Khusus kolom Kendala Komunikasi: pesan status otomatis ("Belum diisi
   * status komunikasi semua/sebagian sekolah...") yang dipisah keluar dari
   * `text` - ditampilkan sebagai card kecil di LUAR input field, bukan
   * dicampur dengan narasi bebas fasilitator. null kalau tidak ada/tidak relevan. */
  statusNote: string | null;
}

const STATUS_KOMUNIKASI_PATTERN = /^belum\s+diisi\s+status\s+komunikasi\s+(semua|sebagian)\s+sekolah(\s*\(\s*\d+\s*dari\s*\d+\s*\))?\.?$/i;

function extractStatusKomunikasiNote(text: string): { note: string | null; rest: string } {
  const parts = text
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const noteParts = parts.filter((p) => STATUS_KOMUNIKASI_PATTERN.test(p));
  const restParts = parts.filter((p) => !STATUS_KOMUNIKASI_PATTERN.test(p));
  return { note: noteParts.length ? noteParts.join(" | ") : null, rest: restParts.join(" | ") };
}

function lastActiveCommunicationDay(history: FacilRow[], beforeDay: number): number | null {
  const byHari = new Map(history.map((r) => [r.hari, r]));
  for (let h = beforeDay - 1; h >= 1; h--) {
    const row = byHari.get(h);
    if (!row) continue;
    const raw = row.kendalaKomunikasi;
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") continue;
    const { rest } = extractStatusKomunikasiNote(text);
    const state = classifyKendalaText(rest);
    if (state === "ada-kendala" || state === "tidak-ada-kendala") return h;
  }
  return null;
}

function kendalaDisplayBase(row: FacilRow, history: FacilRow[], key: keyof FacilRow, hari: number): KendalaDisplay {
  const raw = row[key];
  const rawText = typeof raw === "string" ? raw.trim() : "";
  const activeFromDay = KENDALA_ACTIVE_FROM_DAY[key];
  const notYetDue = typeof activeFromDay === "number" && hari < activeFromDay;

  if (notYetDue) {
    return { text: `(belum jatuh tempo - checkpoint terkait mulai Hari ${activeFromDay})`, state: "netral", isPlaceholder: true, statusNote: null };
  }

  let text = rawText;
  let statusNote: string | null = null;
  if (key === "kendalaKomunikasi") {
    const extracted = extractStatusKomunikasiNote(rawText);
    if (extracted.note) {
      const lastActive = lastActiveCommunicationDay(history, hari);
      const lastActiveNote = lastActive != null ? `terakhir kali melapor komunikasi: Hari ${lastActive}` : "belum pernah melapor komunikasi di histori yang tersedia";
      statusNote = `${extracted.note} - ${lastActiveNote}`;
      text = extracted.rest;
    }
  }

  const kendalaState = classifyKendalaText(text);
  if (kendalaState === "belum-diisi") {
    const isLiteralSentinel = text === "Belum Diisi";
    const displayText = isLiteralSentinel ? "(belum diisi fasilitator, padahal checkpoint sudah jatuh tempo)" : text;
    return { text: displayText, state: "belum-diisi", isPlaceholder: isLiteralSentinel, statusNote };
  }
  if (kendalaState === "kosong") {
    return { text: "(tidak ada kendala / aman)", state: "aman", isPlaceholder: true, statusNote };
  }
  if (kendalaState === "tidak-ada-kendala") {
    return { text, state: "aman", isPlaceholder: false, statusNote };
  }
  return { text, state: "ada-kendala", isPlaceholder: false, statusNote };
}

const KENDALA_STATE_CONTAINER: Record<KendalaState, string> = {
  aman: `${TIER_STYLES.hijau.bg} border-status-good/40`,
  "belum-diisi": `${TIER_STYLES.kuning.bg} border-status-warning/40`,
  "ada-kendala": `${TIER_STYLES.merah.bg} border-status-critical/40`,
  netral: "border-hairline bg-background",
};

const komunikasiIndicatorInfo = findIndicator("pctSekolahBelumDihubungi");

function ContactStatusNote({ compliance }: { compliance: CheckpointCompliance[] }) {
  const ind = compliance.find((c) => c.group.no === 1)?.indicators.find((i) => i.kolom === "pctSekolahBelumDihubungi");
  if (!ind) return null;

  const tooltipText = komunikasiIndicatorInfo
    ? `${komunikasiIndicatorInfo.indicator.definisi} (sumber: ${komunikasiIndicatorInfo.indicator.sumberData ?? "-"}). Persentase mentah dari LK Fasil - dihitung fasilitator sendiri terhadap semesta sekolah yang ditangani, bukan dihitung ulang aplikasi ini.`
    : undefined;

  if (ind.status === "unknown") {
    return (
      <div className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-sm)] bg-status-unknown/10 px-2 py-1 text-[11px] font-semibold text-ink-muted">
        ⚠ Status hubungi belum bisa dipastikan{ind.note ? ` - ${ind.note}` : ""}
        {tooltipText && <InfoTooltip text={tooltipText} />}
      </div>
    );
  }
  const raw = parseFloat(ind.detail);
  if (Number.isNaN(raw)) return null;
  const tier = classifySeverity(raw, "higherIsWorse");
  const s = TIER_STYLES[tier];
  const label = raw === 0 ? "Sudah menghubungi semua sekolah" : `Belum menghubungi ${ind.detail} sekolah`;
  return (
    <div className={`inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
      {label}
      {tooltipText && <InfoTooltip text={tooltipText} />}
    </div>
  );
}

interface FacilitatorRef {
  kodeFasil: string;
  namaFasil: string;
}

function facilHref(kodeFasil: string, hari: number, mode: "alltime" | "harian"): string {
  const params = new URLSearchParams();
  if (mode === "alltime") params.set("mode", "alltime");
  else params.set("hari", String(hari));
  return `/fasilitator/${kodeFasil}?${params.toString()}`;
}

export function FacilKendalaPanel({
  row,
  history,
  compliance,
  hari,
  notes,
  unfilled,
}: {
  row: FacilRow;
  history: FacilRow[];
  compliance: CheckpointCompliance[];
  hari: number;
  notes?: NoteRange[];
  unfilled?: NoteRange[];
}) {
  const [firstField, ...restFields] = KENDALA_FIELDS;

  const renderField = (f: (typeof KENDALA_FIELDS)[number]) => {
    const d = kendalaDisplayBase(row, history, f.key, hari);
    return (
      <label key={String(f.key)} className="flex h-full flex-col gap-1 text-xs text-ink-secondary">
        <span className="font-semibold text-ink-primary">{KEY_TO_HEADER[f.key] ?? f.label}</span>
        {f.key === "kendalaKomunikasi" && <ContactStatusNote compliance={compliance} />}
        {d.statusNote && (
          <div className={`inline-flex w-fit items-center gap-1 rounded-[var(--radius-sm)] px-2 py-0.5 text-[10px] font-semibold ${TIER_STYLES.kuning.bg} ${TIER_STYLES.kuning.text}`}>
            {d.statusNote}
          </div>
        )}
        <textarea
          readOnly
          value={d.text}
          className={`flex-1 min-h-[4rem] resize-none rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs leading-relaxed ${KENDALA_STATE_CONTAINER[d.state]} ${
            d.isPlaceholder ? "italic text-ink-muted" : "text-ink-primary font-medium"
          } focus:outline-none`}
        />
      </label>
    );
  };

  const mengundurkanDiriRaw = row.jumlahSekolahMengundurkanDiri;
  const mengundurkanDiriCount = typeof mengundurkanDiriRaw === "string" ? parseInt(mengundurkanDiriRaw, 10) : typeof mengundurkanDiriRaw === "number" ? mengundurkanDiriRaw : 0;

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-2 border-b border-hairline bg-surface-soft px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-title-sm text-ink-primary">Catatan Kendala Fasil (Hari ke-{hari})</h3>
          {mengundurkanDiriCount > 0 ? (
            <span className="rounded-[var(--radius-sm)] bg-status-critical/15 px-3 py-1 text-xs font-bold text-status-critical border border-status-critical/40 animate-pulse">
              ⚠ {mengundurkanDiriCount} Sekolah Mengundurkan Diri!
            </span>
          ) : (
            <span className="rounded-[var(--radius-sm)] bg-background px-2.5 py-1 text-xs font-medium text-ink-muted border border-hairline">
              0 Sekolah Mengundurkan Diri
            </span>
          )}
        </div>
      </div>

      <div className="p-5 flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          <div className="w-full">{renderField(firstField)}</div>
          <div className="w-full"><FacilDocumentFunnel row={row} kategori="Admin" /></div>
          <div className="w-full"><FacilDocumentFunnel row={row} kategori="Teknis" /></div>
        </div>

        <div className="grid grid-cols-1 auto-rows-fr gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {restFields.map(renderField)}
        </div>

        {((notes && notes.length > 0) || (unfilled && unfilled.length > 0)) && (
          <div className="flex flex-col gap-4 border-t border-hairline pt-5">
            {notes && notes.length > 0 && (
              <div>
                <h4 className="mb-3 text-body-md font-semibold text-ink-primary">Riwayat Catatan Kualitatif</h4>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                  {notes.map((n, i) => (
                    <li key={i} className="rounded-[var(--radius-sm)] border border-hairline bg-surface-soft p-2.5 text-xs">
                      <span className="mr-2 inline-block rounded-[var(--radius-xs)] bg-background border border-hairline px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
                        {n.hariStart === n.hariEnd ? `Hari ${n.hariStart}` : `Hari ${n.hariStart}-${n.hariEnd}`}
                      </span>
                      <span className="font-semibold text-ink-secondary">{n.label}:</span> <span className="text-ink-primary font-medium">{n.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unfilled && unfilled.length > 0 && (
              <div>
                <h4 className="mb-3 text-body-md font-semibold text-ink-primary">Kendala Belum Diisi Fasilitator</h4>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                  {unfilled.map((n, i) => (
                    <li key={i} className="rounded-[var(--radius-sm)] border border-hairline bg-surface-soft px-3 py-2 text-xs text-ink-muted">
                      <span className="mr-2 inline-block rounded-[var(--radius-xs)] bg-background border border-hairline px-1.5 py-0.5 text-[10px] font-semibold">
                        {n.hariStart === n.hariEnd ? `Hari ${n.hariStart}` : `Hari ${n.hariStart}-${n.hariEnd}`}
                      </span>
                      {n.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function FacilitatorAnalysisWorkbench({
  row,
  hari,
  mode,
  prevFacilitator,
  nextFacilitator,
  facilPosition,
  totalFacilitators,
  existingAnalisis,
  configuredProviders = [],
  history,
  dayLogs,
  prevDayLogs,
}: {
  row: FacilRow;
  hari: number;
  mode: "alltime" | "harian";
  prevFacilitator: FacilitatorRef | null;
  nextFacilitator: FacilitatorRef | null;
  facilPosition: number | null;
  totalFacilitators: number;
  existingAnalisis: string | null;
  configuredProviders?: string[];
  history?: FacilRow[];
  dayLogs?: { log1: FacilRow | null; log2: FacilRow | null } | null;
  /** Snapshot Log 1/Log 2 hari SEBELUMNYA (hari - 1) - dipakai untuk
   * membandingkan Log slot yang SAMA (lihat prevActiveRow di bawah) di
   * narasi AI/Copy Prompt, BUKAN cuma "hari sebelumnya" sembarang slot. */
  prevDayLogs?: { log1: FacilRow | null; log2: FacilRow | null } | null;
}) {
  const [hasil, setHasil] = useState(existingAnalisis ?? fieldValue(row, "analisis"));
  const [logSource, setLogSource] = useState<"log1" | "log2">(defaultLogSource(dayLogs));
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "done" | "error">("idle");
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyAnalysisState, setCopyAnalysisState] = useState<"idle" | "copying" | "done" | "error">("idle");
  const [copyAnalysisError, setCopyAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    setLogSource(defaultLogSource(dayLogs));
  }, [hari, dayLogs?.log1, dayLogs?.log2]);

  const activeRow = logSource === "log1" ? (dayLogs?.log1 ?? row) : (dayLogs?.log2 ?? row);
  // Log SLOT YANG SAMA (log1/log2) di hari sebelumnya - null kalau tidak ada
  // (mis. Hari 1, atau admin belum pernah isi slot itu kemarin). SENGAJA
  // TIDAK fallback ke row/slot lain - kalau Log 2 kemarin kosong, itu memang
  // berarti tidak ada pembanding, bukan dianggap sama dengan Log 1 kemarin.
  const prevActiveRow = logSource === "log1" ? (prevDayLogs?.log1 ?? null) : (prevDayLogs?.log2 ?? null);

  const [showConfig, setShowConfig] = useState(false);
  const [aiProvider, setAiProvider] = useState<string>("");
  const [aiKeys, setAiKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    let savedProvider = localStorage.getItem("uwu_ai_provider") || "";
    if (!savedProvider) {
      savedProvider = configuredProviders.length > 0 ? configuredProviders[0] : "OpenAI";
    }
    setAiProvider(savedProvider);
    try {
      const savedKeys = localStorage.getItem("uwu_ai_keys");
      if (savedKeys) {
        setAiKeys(JSON.parse(savedKeys));
      } else {
        const oldKey = localStorage.getItem("uwu_ai_key");
        if (oldKey) {
          setAiKeys({ [savedProvider]: oldKey });
        }
      }
    } catch {
      // Abaikan error parse
    }
  }, [configuredProviders]);

  useEffect(() => {
    if (existingAnalisis != null) return;
    if (hasil.trim()) return;
    let cancelled = false;
    fetch(`/api/analisis?kode=${encodeURIComponent(row.kodeFasil)}&hari=${hari}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.analisis && !hasil.trim()) {
          setHasil(data.analisis);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [existingAnalisis, row.kodeFasil, hari]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveConfig() {
    localStorage.setItem("uwu_ai_provider", aiProvider);
    localStorage.setItem("uwu_ai_keys", JSON.stringify(aiKeys));
    setShowConfig(false);
  }

  function handleKeyChange(val: string) {
    setAiKeys(prev => ({ ...prev, [aiProvider]: val }));
  }

  async function generate() {
    if (hasil.trim() && !window.confirm("Ada isi di field Hasil Analisis (mungkin belum disimpan). Timpa dengan hasil generate AI yang baru?")) {
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      // `hari` SELALU dikirim (dulu di-skip untuk mode "alltime") - server
      // pakai ini sebagai targetHari buat nentuin baris MANA di `history`
      // yang jadi "hari yang dianalisis" (lihat buildFacilitatorAnalysisMessages
      // di core/prompts.ts). Tanpa ini, server bisa salah ambil baris kalau
      // `history` berisi hari-hari setelah `hari` (mis. baris kosong hari
      // berikutnya yang sudah otomatis ada di masterLog) - gejalanya narasi
      // memakai data hari/Log slot yang salah walau admin sudah pilih Log
      // 1/Log 2 yang benar lewat toggle di atas.
      const basePayload = { kodeFasil: row.kodeFasil, hari };
      const modifiedHistory = history ? history.map((r) => (r.hari === hari ? activeRow : r)) : undefined;
      const payload = { ...basePayload, history: modifiedHistory, prevRow: mode === "alltime" ? undefined : prevActiveRow, aiProvider, aiKey: aiKeys[aiProvider] || "" };
      const res = await fetch("/api/analyze/facilitator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat analisis.");
      setHasil(data.result);
      setSaveState("idle");
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyPrompt() {
    setCopyState("copying");
    setCopyError(null);
    try {
      const promptText = buildFacilitatorCopyPromptText(activeRow, hari, prevActiveRow);
      await navigator.clipboard.writeText(promptText);
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch (err) {
      setCopyState("error");
      setCopyError(err instanceof Error ? err.message : "Gagal menyalin prompt.");
    }
  }

  async function copyAnalysis() {
    if (!hasil.trim()) return;
    setCopyAnalysisState("copying");
    setCopyAnalysisError(null);
    try {
      await navigator.clipboard.writeText(hasil);
      setCopyAnalysisState("done");
      setTimeout(() => setCopyAnalysisState("idle"), 2000);
    } catch (err) {
      setCopyAnalysisState("error");
      setCopyAnalysisError(err instanceof Error ? err.message : "Gagal menyalin analisis.");
    }
  }

  async function saveToSheet() {
    if (!hasil.trim()) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/analyze/save-to-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ kodeFasil: row.kodeFasil, namaFasil: row.namaFasil, hari, hasil }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan ke spreadsheet.");
      if ((data.updated ?? 0) === 0) {
        setSaveState("error");
        const reason: string[] | undefined = data.notFound;
        setSaveError(
          reason && reason.length > 0
            ? reason.join("; ")
            : `Tidak ditemukan baris "${row.kodeFasil}" + Hari ${hari} di spreadsheet LK fasilitator tersebut.`
        );
      } else {
        setSaveState("done");
      }
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Gagal menyimpan ke spreadsheet.");
    }
  }

  return (
    <div className="flex max-h-[calc(100vh-5rem)] flex-col gap-4 overflow-y-auto pr-1">
      {/* Bagian Navigasi */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-1 text-body-md">
        {prevFacilitator ? (
          <Link href={facilHref(prevFacilitator.kodeFasil, hari, mode)} className="text-link hover:text-link-active font-medium">
            &larr; {prevFacilitator.namaFasil}
          </Link>
        ) : (
          <span className="text-ink-muted">&larr; (awal daftar)</span>
        )}
        {facilPosition != null && (
          <span className="text-xs text-ink-muted font-semibold" title={`Fasilitator ke-${facilPosition} dari ${totalFacilitators} yang Anda pegang`}>
            {facilPosition} / {totalFacilitators}
            {facilPosition < totalFacilitators && ` · ${totalFacilitators - facilPosition} lagi`}
          </span>
        )}
        {nextFacilitator ? (
          <Link
            href={facilHref(nextFacilitator.kodeFasil, hari, mode)}
            className="btn-primary !py-1.5 !px-3.5 !text-xs font-semibold"
          >
            Selanjutnya: {nextFacilitator.namaFasil} &rarr;
          </Link>
        ) : (
          <span className="text-ink-muted text-xs font-semibold">(akhir daftar) &rarr;</span>
        )}
      </div>

      {/* Bagian Hasil Analisis (Atas) */}
      <div className="card shrink-0 p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3.5">
          <label htmlFor="hasil-analisis" className="text-body-md font-semibold text-ink-primary">
            Hasil Analisis AI
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyPrompt}
              disabled={copyState === "copying"}
              title="Salin prompt-nya (lengkap dengan contoh format & data fasilitator ini) untuk di-paste manual ke Gemini Pro atau chat LLM lain"
              className="btn-secondary !py-1.5 !px-3 !text-xs disabled:opacity-50"
            >
              {copyState === "copying" ? "Menyiapkan..." : copyState === "done" ? "✓ Tersalin" : "Copy Prompt"}
            </button>
            <button
              onClick={() => setShowConfig(!showConfig)}
              title="Konfigurasi API Key Pribadi"
              className="btn-secondary !py-1.5 !px-2.5 !text-xs"
            >
              ⚙️
            </button>
            <button
              onClick={generate}
              disabled={generating}
              className="btn-primary !py-1.5 !px-3.5 !text-xs disabled:opacity-50"
            >
              {generating ? "Menganalisis..." : hasil ? "Generate Ulang" : "Generate dengan AI"}
            </button>
          </div>
        </div>

        {showConfig && (
          <div className="flex flex-col gap-3 rounded-[var(--radius-sm)] bg-surface-soft border border-hairline p-4 text-xs">
            <div>
              <div className="font-semibold text-ink-primary text-body-md">Konfigurasi API Key Pribadi</div>
              <div className="text-ink-secondary mt-0.5">Gunakan kunci API milik Anda sendiri agar tidak terbentur limit global.</div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex flex-col gap-1 sm:w-1/3">
                <span className="font-semibold text-ink-primary">Provider</span>
                <select 
                  value={aiProvider} 
                  onChange={(e) => setAiProvider(e.target.value)}
                  className="rounded-[var(--radius-sm)] border border-hairline px-2.5 py-1.5 bg-background text-ink-primary focus:border-info-border focus:outline-none"
                >
                  <option value="Google Gemini">Google Gemini</option>
                  <option value="Groq">Groq</option>
                  <option value="OpenRouter">OpenRouter</option>
                  <option value="Hugging Face">Hugging Face</option>
                  <option value="OpenAI">OpenAI</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:w-2/3">
                <span className="font-semibold text-ink-primary">API Key <span className="text-ink-muted font-normal">(opsional jika default)</span></span>
                <input 
                  type="password"
                  value={aiKeys[aiProvider] || ""}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder={configuredProviders?.includes(aiProvider) ? "(Telah dikonfigurasi oleh Admin)" : `Masukkan API Key untuk ${aiProvider}`}
                  className="rounded-[var(--radius-sm)] border border-hairline px-2.5 py-1.5 bg-background text-ink-primary focus:border-info-border focus:outline-none"
                />
              </label>
            </div>
            {configuredProviders?.includes(aiProvider) && !aiKeys[aiProvider] && (
              <p className="text-[11px] text-status-good font-semibold">✓ Sistem sudah memiliki kunci bawaan untuk provider ini. Anda tidak perlu mengisinya.</p>
            )}
            <button 
              onClick={saveConfig}
              className="btn-secondary !w-fit !py-1.5 !px-3.5 !text-xs mt-1"
            >
              Simpan Konfigurasi
            </button>
          </div>
        )}

        <div>
          <span className="text-xs font-bold text-status-critical">Harap cek ulang hasil generate analisis, karena AI nya bisa ngawur cok!</span>
        </div>

        <div className="rounded-[var(--radius-sm)] border border-hairline bg-surface-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-semibold text-ink-primary">Sumber Data Analisis:</span>
              <div className="inline-flex gap-0.5 rounded-[var(--radius-sm)] border border-hairline bg-background p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setLogSource("log1")}
                  disabled={!hasLogData(dayLogs?.log1)}
                  className={`rounded-[var(--radius-xs)] px-3 py-1 transition-all ${
                    logSource === "log1"
                      ? "bg-primary text-on-primary font-semibold"
                      : "text-ink-secondary hover:text-ink-primary disabled:opacity-40"
                  }`}
                  title={!hasLogData(dayLogs?.log1) ? "Data Log 1 (07.00 WIB) kosong / belum diisi fasilitator" : "Gunakan data Log 1 Pagi (07.00 WIB)"}
                >
                  Log 1 (07.00 WIB) {!hasLogData(dayLogs?.log1) ? "🚫" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setLogSource("log2")}
                  disabled={!hasLogData(dayLogs?.log2)}
                  className={`rounded-[var(--radius-xs)] px-3 py-1 transition-all ${
                    logSource === "log2"
                      ? "bg-primary text-on-primary font-semibold"
                      : "text-ink-secondary hover:text-ink-primary disabled:opacity-40"
                  }`}
                  title={!hasLogData(dayLogs?.log2) ? "Data Log 2 (13.30 WIB) kosong / belum diisi fasilitator" : "Gunakan data Log 2 Sore (13.30 WIB)"}
                >
                  Log 2 (13.30 WIB) {!hasLogData(dayLogs?.log2) ? "🚫" : ""}
                </button>
              </div>
            </div>
          </div>
        </div>

        <textarea
          id="hasil-analisis"
          value={hasil}
          onChange={(e) => {
            setHasil(e.target.value);
            setSaveState("idle");
          }}
          placeholder='Tulis manual, atau klik "Generate dengan AI" di atas lalu edit hasilnya di sini...'
          rows={7}
          className="resize-y rounded-[var(--radius-sm)] border border-hairline bg-background p-3.5 text-body-md text-ink-primary leading-relaxed placeholder:italic placeholder:text-ink-muted focus:border-info-border focus:outline-none"
        />
        {genError && <p className="text-body-md text-status-critical font-medium">{genError}</p>}
        {copyError && <p className="text-body-md text-status-critical font-medium">{copyError}</p>}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={saveToSheet}
            disabled={saveState === "saving" || !hasil.trim()}
            className="btn-primary !py-2 !px-4 !text-xs font-semibold disabled:opacity-50"
          >
            {saveState === "saving" ? "Menyimpan..." : "Simpan ke Spreadsheet"}
          </button>
          
          <button
            onClick={copyAnalysis}
            disabled={copyAnalysisState === "copying" || !hasil.trim()}
            className="btn-secondary !py-2 !px-4 !text-xs font-semibold disabled:opacity-50"
          >
            {copyAnalysisState === "copying" ? "Menyalin..." : copyAnalysisState === "done" ? "✓ Tersalin" : "Copy Analisis"}
          </button>

          {saveState === "done" && <span className="text-xs font-semibold text-status-good">✓ Tersimpan (Kolom Analisis Hari {hari})</span>}
          {saveState === "error" && <span className="text-xs text-status-critical font-medium">{saveError}</span>}
          {copyAnalysisError && <span className="text-xs text-status-critical font-medium">{copyAnalysisError}</span>}
        </div>
      </div>
    </div>
  );
}
