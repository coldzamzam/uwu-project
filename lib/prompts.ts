import { activeCheckpoints, buildKnowledgeSummary } from "./knowledge/checkpoints";
import { getEffectiveRisk } from "./metrics";
import { QUALITATIVE_FIELDS } from "./notes";
import type { FacilRow } from "./types";
import type { ChatMessage } from "./llm";

const SYSTEM_PROMPT = `Anda adalah asisten analis untuk program revitalisasi sekolah. Tugas Anda menganalisis data
kinerja fasilitator lapangan berdasarkan Lembar Kerja (LK) dan aplikasi monitoring ("Aplikasi Revit"),
lalu memberi kesimpulan yang jujur dan actionable kepada admin program.

Aturan penting:
- Data berupa persentase "masalah" (mis. "% Sekolah Belum Login Aplikasi") - semakin TINGGI nilainya semakin BURUK.
- "Nilai Risiko" adalah skor terbobot 0-100% (semakin tinggi = semakin berisiko), dihitung dari checkpoint-checkpoint yang diberikan. Kalau ditandai "(estimasi)", berarti kolom itu kosong di sheet dan dihitung otomatis oleh aplikasi dari bobot checkpoint - sebut ke pembaca bahwa angka itu estimasi, bukan hasil resmi sheet.
- JANGAN menyalahkan fasilitator untuk checkpoint yang belum berlaku pada hari tsb (lihat catatan "belum relevan" di data).
- Jika ada "Catatan Admin" yang sudah ditulis manusia, jadikan itu konteks tambahan - jangan diulang mentah-mentah, tapi boleh dikonfirmasi/dipertajam. Kolom "Analisis" sengaja TIDAK diikutkan sebagai konteks - itu tempat menyimpan hasil analisis AI ini sendiri (lewat fitur "Tambahkan ke Spreadsheet"), supaya tiap analisis baru murni dari data terkini, bukan menggemakan hasil analisis lama.
- Perhatikan pola anomali: data yang sama sekali tidak berubah selama beberapa hari berturut-turut sering menandakan fasilitator berhenti mengisi laporan, bukan kondisi yang benar-benar stabil.
- Kolom bersumber "LK Fasil" yang terbaca 0% masalah atau "Sudah" TIDAK OTOMATIS berarti kondisinya baik - itu bisa jadi cuma default kosong di sheet kalau fasilitator belum login LK sama sekali, atau catatan "Kendala..." terkait menyebut "belum diisi". Selalu silangkan dengan status "Fasil Belum Login LK" dan catatan Kendala terkait sebelum menyimpulkan sesuatu "aman" - jangan tertipu angka 0% yang sebenarnya berarti "belum ada data", bukan "sudah terverifikasi baik".
- Jawab dalam Bahasa Indonesia, dalam bentuk poin-poin saja - SATU kalimat ringkas per poin, tanpa sub-bullet, tanpa paragraf penjelasan tambahan, tanpa pembuka/penutup di luar poin yang diminta.`;

/** QUALITATIVE_FIELDS tanpa "analisis" - dipakai khusus untuk konteks yang
 * dikirim ke LLM (lihat catatan di SYSTEM_PROMPT soal kenapa kolom itu
 * dikecualikan). Tampilan UI (halaman detail fasilitator, chart aktivitas)
 * tetap pakai QUALITATIVE_FIELDS penuh dari lib/notes.ts. */
const PROMPT_QUALITATIVE_FIELDS = QUALITATIVE_FIELDS.filter((f) => f.key !== "analisis");

function formatCell(v: FacilRow[keyof FacilRow]): string {
  if (v == null) return "-";
  if (typeof v === "number") return `${v}%`;
  return String(v);
}

function formatRisk(row: FacilRow): string {
  const risk = getEffectiveRisk(row);
  if (risk.value == null) return "-";
  return `${risk.value.toFixed(1)}%${risk.estimated ? " (estimasi)" : ""}`;
}

function buildHistoryTable(history: FacilRow[], maxDay: number): string {
  const groups = activeCheckpoints(maxDay);
  const cols = groups.flatMap((g) => g.indicators.map((i) => i.kolom));
  const uniqueCols = Array.from(new Set(cols));

  const header = ["Hari", "Nilai Risiko", ...uniqueCols].join(" | ");
  const sep = uniqueCols.map(() => "---").join(" | ");
  const rows = history.map((row) => {
    const cells = uniqueCols.map((c) => (row.hari >= (groups.find((g) => g.indicators.some((i) => i.kolom === c))?.activeFromDay ?? 0) ? formatCell(row[c]) : "(belum berlaku)"));
    return [`Hari ${row.hari}`, formatRisk(row), ...cells].join(" | ");
  });

  return [header, `--- | --- | ${sep}`, ...rows].join("\n");
}

function buildQualitativeNotes(history: FacilRow[]): string {
  const lines: string[] = [];
  for (const row of history) {
    for (const field of PROMPT_QUALITATIVE_FIELDS) {
      const value = row[field.key];
      if (typeof value === "string" && value.trim() !== "" && value !== "Belum Diisi") {
        lines.push(`- Hari ${row.hari} - ${field.label}: ${value}`);
      }
    }
  }
  return lines.length ? lines.join("\n") : "(tidak ada catatan kualitatif tambahan)";
}

export function buildFacilitatorAnalysisMessages(history: FacilRow[]): ChatMessage[] {
  if (history.length === 0) throw new Error("Tidak ada data histori untuk fasilitator ini.");
  const maxDay = history[history.length - 1].hari;
  const latest = history[history.length - 1];

  const userPrompt = `Fasilitator: ${latest.namaFasil} (${latest.kodeFasil})
Koordinator: ${latest.namaKoor} (${latest.kodeKoor})
Data tersedia sampai Hari ke-${maxDay} dari siklus 14 hari.

## Basis Pengetahuan Checkpoint (kolom, bobot, definisi)
${buildKnowledgeSummary(maxDay)}

## Tabel Tren Harian
${buildHistoryTable(history, maxDay)}

## Catatan Kualitatif (Kendala / Analisis / Catatan Admin yang sudah ada)
${buildQualitativeNotes(history)}

Tolong jawab dalam TEPAT 4 poin, satu kalimat ringkas per poin (maksimal ~25 kata), tanpa sub-bullet atau penjelasan tambahan:
1. **Ringkasan Kinerja** - bagus/cukup/butuh perhatian, dan kenapa, dalam satu kalimat.
2. **Red Flags** - masalah paling mendesak dalam satu kalimat (atau "Tidak ada red flag saat ini" kalau memang tidak ada).
3. **Indikasi Anomali** - pola mencurigakan paling menonjol dalam satu kalimat (atau "Tidak ada anomali terdeteksi" kalau memang tidak ada).
4. **Rekomendasi Tindak Lanjut** - satu tindakan paling penting untuk admin/koordinator.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

export function buildDailySummaryMessages(dayRows: FacilRow[], hari: number): ChatMessage[] {
  if (dayRows.length === 0) throw new Error("Tidak ada data untuk hari ini.");
  const sorted = [...dayRows].sort((a, b) => {
    const av = getEffectiveRisk(a).value ?? -1;
    const bv = getEffectiveRisk(b).value ?? -1;
    return bv - av;
  });

  const table = sorted
    .map((r) => `- ${r.namaFasil} (${r.kodeFasil}, koor: ${r.namaKoor}) - Nilai Risiko: ${formatRisk(r)}, Belum Login LK: ${formatCell(r.fasilBelumLoginLK)}, Belum Login Aplikasi: ${formatCell(r.pctSekolahBelumLoginAplikasi)}`)
    .join("\n");

  const notes = dayRows
    .flatMap((r) =>
      PROMPT_QUALITATIVE_FIELDS.filter((f) => {
        const v = r[f.key];
        return typeof v === "string" && v.trim() !== "" && v !== "Belum Diisi";
      }).map((f) => `- ${r.namaFasil}: [${f.label}] ${r[f.key]}`)
    )
    .join("\n");

  const userPrompt = `Ringkasan seluruh fasilitator (${dayRows.length} orang) pada Hari ke-${hari} dari siklus 14 hari.

## Basis Pengetahuan Checkpoint yang Relevan Hari Ini
${buildKnowledgeSummary(hari)}

## Data per Fasilitator (diurutkan dari risiko tertinggi)
${table}

## Catatan Kualitatif dari Lapangan
${notes || "(tidak ada catatan kualitatif tambahan)"}

Tolong jawab dalam TEPAT 4 poin, satu kalimat ringkas per poin (maksimal ~25 kata), tanpa sub-bullet atau penjelasan tambahan:
1. **Kondisi Umum** - gambaran keseluruhan kinerja hari ini dalam satu kalimat.
2. **Fasilitator Prioritas** - siapa yang paling butuh perhatian/intervensi segera, dan kenapa, dalam satu kalimat.
3. **Pola Kendala Umum** - kendala paling menonjol yang berulang di banyak fasilitator dalam satu kalimat (atau "Tidak ada pola kendala umum" kalau memang tidak ada).
4. **Rekomendasi Prioritas Admin** - satu tindakan paling penting untuk hari ini/besok.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}
