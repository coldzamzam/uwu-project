import { activeCheckpoints, buildKnowledgeSummary, TOTAL_HARI_SIKLUS } from "./knowledge/checkpoints";
import type { CheckpointIndicator } from "./knowledge/checkpoints";
import { getEffectiveRisk, summarizeDay } from "./metrics";
import { getCheckpointCompliance, countNonCompliant } from "./compliance";
import type { CheckpointCompliance } from "./compliance";
import { QUALITATIVE_FIELDS } from "./notes";
import type { FacilRow } from "./types";
import type { ChatMessage } from "./llm";
import { TIER_LABEL, TIER_RANK, indicatorSeverity } from "./severity";
import type { SeverityTier } from "./severity";

const SYSTEM_PROMPT = `Anda adalah asisten analis untuk program revitalisasi sekolah. Tugas Anda menganalisis data
kinerja fasilitator lapangan berdasarkan Lembar Kerja (LK) dan aplikasi monitoring ("Aplikasi Revit"),
lalu memberi kesimpulan yang jujur dan actionable kepada admin program.

Aturan penting:
- Data berupa persentase "masalah" (mis. "% Sekolah Belum Login Aplikasi") - semakin TINGGI nilainya semakin BURUK.
- "Nilai Risiko" adalah skor terbobot 0-100% (semakin tinggi = semakin berisiko), dihitung dari checkpoint-checkpoint yang diberikan. Kalau ditandai "(estimasi)", berarti kolom itu kosong di sheet dan dihitung otomatis oleh aplikasi dari bobot checkpoint - sebut ke pembaca bahwa angka itu estimasi, bukan hasil resmi sheet.
- JANGAN menyalahkan fasilitator untuk checkpoint yang belum berlaku pada hari tsb (lihat catatan "belum relevan" di data).
- Jika ada "Catatan Admin" yang sudah ditulis manusia, jadikan itu konteks tambahan - jangan diulang mentah-mentah, tapi boleh dikonfirmasi/dipertajam. Kolom "Analisis" sengaja TIDAK diikutkan sebagai konteks - itu tempat menyimpan hasil analisis AI ini sendiri (lewat fitur "Tambahkan ke Spreadsheet"), supaya tiap analisis baru murni dari data terkini, bukan menggemakan hasil analisis lama.
- Perhatikan pola anomali secara SPESIFIK, jangan cuma bilang "ada anomali" tanpa merinci - sebut jenisnya, mis.: (a) checkpoint yang berulang kali Belum Sesuai padahal sudah lama jatuh tempo, (b) data Hasil LK yang tidak konsisten/tidak sesuai dengan data Aplikasi (dua sumber independen saling bertentangan), (c) data yang sama sekali tidak berubah selama beberapa hari berturut-turut (indikasi fasilitator berhenti mengisi laporan, bukan kondisi yang benar-benar stabil), dan (d) fasilitator yang polanya menunjukkan cuma aktif di sisi Aplikasi/administratif (rajin login/isi form) tapi checkpoint substantif ke sekolah tidak kunjung maju - ini patut disebut sebagai indikasi fasilitator kurang proaktif/asal isi di lapangan (kesan malas verifikasi langsung ke sekolah), bukan sekadar "data belum update".
- Format daftar: ikuti PERSIS instruksi pemisah/marker antar poin yang diberikan di user prompt (mis. dash "-" di awal baris, baris kosong, atau token custom seperti "/br/br") - JANGAN pakai default lain (dash atau penomoran "1.", "2.", dst) kalau user prompt secara eksplisit meminta format pemisah yang berbeda. Ikuti persis jumlah dan isi poin yang diminta.
- Kolom bersumber "LK Fasil" yang terbaca 0% masalah atau "Sudah" TIDAK OTOMATIS berarti kondisinya baik - itu bisa jadi cuma default kosong di sheet kalau fasilitator belum login LK sama sekali, atau catatan "Kendala..." terkait menyebut "belum diisi". Selalu silangkan dengan status "Fasil Belum Login LK" dan catatan Kendala terkait sebelum menyimpulkan sesuatu "aman" - jangan tertipu angka 0% yang sebenarnya berarti "belum ada data", bukan "sudah terverifikasi baik".
- Data yang dianalisis selalu terdiri dari dua jenis, dan JANGAN dicampur jadi satu poin: (1) data KUANTITATIF - Nilai Risiko, persentase checkpoint, status kepatuhan; (2) data KUALITATIF - catatan bebas seperti Kendala/Analisis Admin/Catatan Admin dari lapangan. Kalau diminta membahas keduanya, tulis sebagai dua bagian terpisah, bukan digabung dalam satu kalimat.
- Kalau diberi bagian "Perbandingan dengan Hari Sebelumnya", pakai itu apa adanya untuk merefleksikan perubahan (naik/turun/berubah status) - JANGAN mengarang perubahan yang tidak ada di data itu. Kalau bagian itu bilang tidak ada data pembanding (mis. Hari 1) atau tidak ada yang berubah, sampaikan itu apa adanya.
- Setiap indikator checkpoint di data sudah dilabeli tingkat keparahan mengikuti acuan admin: Hijau (tidak perlu tindakan), Kuning (monitoring), Oranye (tindak lanjut oleh koordinator), Merah (eskalasi ke pusat/pembinaan intensif). Pakai label ini APA ADANYA saat menyebut urgensi suatu masalah - JANGAN menilai tingkat keparahan sendiri di luar label yang sudah diberikan di data.
- Jawab dalam Bahasa Indonesia. Ikuti persis format/bagian yang diminta (termasuk judul bagian kalau ada) - isi tiap poin dalam bentuk SATU kalimat ringkas, tanpa sub-bullet, tanpa paragraf penjelasan tambahan, tanpa pembuka/penutup di luar yang diminta.
- JANGAN pakai label/judul tebal (format "**Kata Kunci**:") di depan tiap poin, dan jangan sekadar mengisi template kaku - tulis tiap kalimat mengalir natural, seolah manusia yang buru-buru mengetik catatan singkat, bukan laporan AI yang formal.`;

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

function formatDelta(prev: number, curr: number): string {
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) return "tetap";
  return diff > 0 ? `naik ${diff.toFixed(1)} poin` : `turun ${Math.abs(diff).toFixed(1)} poin`;
}

/** Versi agregat untuk ringkasan SELURUH fasilitator - membandingkan statistik
 * hari ini vs kemarin (rata-rata risiko, jumlah fasilitator risiko
 * tinggi/belum login/checkpoint belum sesuai). */
function buildOverallDayDiff(dayRows: FacilRow[], prevDayRows: FacilRow[], hari: number): string {
  if (hari <= 1) return "(Hari ke-1 - belum ada hari sebelumnya untuk dibandingkan.)";
  if (prevDayRows.length === 0) return `(Tidak ada data Hari ke-${hari - 1} untuk dibandingkan.)`;

  const today = summarizeDay(dayRows);
  const yesterday = summarizeDay(prevDayRows);
  const todayNonCompliant = dayRows.filter((r) => countNonCompliant(getCheckpointCompliance(r, hari)) > 0).length;
  const yesterdayNonCompliant = prevDayRows.filter((r) => countNonCompliant(getCheckpointCompliance(r, hari - 1)) > 0).length;

  const lines: string[] = [];
  if (today.avgRisiko != null && yesterday.avgRisiko != null) {
    lines.push(`- Rata-rata Nilai Risiko: ${yesterday.avgRisiko.toFixed(1)}% -> ${today.avgRisiko.toFixed(1)}% (${formatDelta(yesterday.avgRisiko, today.avgRisiko)}).`);
  } else {
    lines.push(`- Rata-rata Nilai Risiko: tidak bisa dibandingkan (data belum cukup di salah satu hari).`);
  }
  lines.push(`- Fasilitator risiko tinggi: ${yesterday.tinggiCount} orang -> ${today.tinggiCount} orang.`);
  lines.push(`- Fasilitator belum login LK: ${yesterday.belumLogin} orang -> ${today.belumLogin} orang.`);
  lines.push(`- Fasilitator dengan checkpoint belum sesuai: ${yesterdayNonCompliant} orang -> ${todayNonCompliant} orang.`);
  return lines.join("\n");
}

function visibleIndicatorsOf(entry: CheckpointCompliance) {
  return entry.indicators;
}

/** Checkpoint yang jadi acuan "hari ini" - checkpoint yang PERSIS jatuh tempo
 * di `maxDay` kalau ada, atau (banyak hari dalam siklus 14 hari memang tidak
 * punya checkpoint sendiri) checkpoint PALING RECENT yang sudah jatuh tempo
 * (activeFromDay tertinggi yang <= maxDay) sebagai gantinya. Dipakai BERSAMA
 * oleh buildTodayCheckpointStatus (untuk ditampilkan) dan buildProblemCheckpoints
 * (untuk DIKECUALIKAN dari daftar "checkpoint lain" supaya checkpoint yang
 * sama tidak dilaporkan dua kali - sekali sebagai "checkpoint hari ini",
 * sekali lagi sebagai "checkpoint lain"). */
function todayOrMostRecentCheckpoints(compliance: CheckpointCompliance[], maxDay: number): CheckpointCompliance[] {
  const isVisible = (c: CheckpointCompliance) => visibleIndicatorsOf(c).length > 0;
  const exact = compliance.filter((c) => c.group.activeFromDay === maxDay && isVisible(c));
  if (exact.length > 0) return exact;

  const dueSoFar = compliance.filter((c) => c.group.activeFromDay <= maxDay && isVisible(c));
  if (dueSoFar.length === 0) return [];
  const mostRecentDay = Math.max(...dueSoFar.map((c) => c.group.activeFromDay));
  return dueSoFar.filter((c) => c.group.activeFromDay === mostRecentDay);
}

/** Checkpoint yang SUDAH jatuh tempo dan MASIH Belum Sesuai, dipisah antara
 * yang PERSIS jatuh tempo Hari ini vs yang sudah jatuh tempo di hari-hari
 * SEBELUMNYA - difilter DI KODE (bukan diserahkan ke LLM) supaya checkpoint
 * yang sudah Sesuai/aman PASTI tidak pernah muncul di data yang dikirim ke
 * LLM sama sekali, bukan cuma "diminta untuk dilewati" (yang terbukti kurang
 * reliable diikuti model). Dipakai untuk ringkasan singkat ala WhatsApp yang
 * HANYA melaporkan masalah.
 *
 * `todayOrMostRecent` = hasil todayOrMostRecentCheckpoints - checkpoint di
 * situ SELALU dikecualikan dari daftar "previous" di sini, baik itu benar-
 * benar jatuh tempo hari ini MAUPUN cuma fallback "paling recent" (kalau
 * fallback, checkpoint itu sudah dilaporkan lewat poin "checkpoint hari ini"
 * di buildTodayCheckpointStatus - jangan diulang lagi di sini). */
function buildProblemCheckpoints(
  compliance: CheckpointCompliance[],
  maxDay: number,
  todayOrMostRecent: CheckpointCompliance[]
): { today: string; previous: string; previousItems: string[] } {
  const visibleIndicators = (entry: CheckpointCompliance) => visibleIndicatorsOf(entry);
  const todayOrMostRecentNos = new Set(todayOrMostRecent.map((c) => c.group.no));

  const formatEntry = (entry: CheckpointCompliance): string | null => {
    const visible = visibleIndicators(entry);
    if (visible.length === 0) return null;
    const detail = visible
      .map((i) => {
        const sev = indicatorSeverity(i, entry.group);
        const tierTag = sev ? ` [${TIER_LABEL[sev]}]` : "";
        const gatingTag = i.gating ? "" : " (info, tidak menggerakkan status)";
        return `${i.label}: ${i.detail}${tierTag}${gatingTag}`;
      })
      .join("; ");
    // Dihitung DI KODE (bukan diserahkan ke LLM menghitung sendiri) supaya
    // angka "sudah berapa hari lewat tenggat" pasti benar - dipakai untuk
    // poin "checkpoint sebelumnya" yang boleh mention durasi keterlambatan.
    const daysOverdue = maxDay - entry.group.activeFromDay;
    const overdueTag = daysOverdue > 0 ? ` (jatuh tempo sejak Hari ke-${entry.group.activeFromDay}, sudah ${daysOverdue} hari lewat tenggat)` : "";
    return `- [${entry.group.no}. ${entry.group.name}] ${detail}${overdueTag}`;
  };

  // Versi SATU KALIMAT per checkpoint, siap pakai jadi SATU POIN TERPISAH
  // masing-masing - dibangun SEPENUHNYA di kode supaya LLM tidak perlu
  // "memutuskan" checkpoint mana yang masuk/tidak (itu terbukti kurang
  // reliable - model kadang menambah checkpoint yang sebenarnya sudah
  // Sesuai, atau bilang "tidak ada masalah" untuk checkpoint yang seharusnya
  // tidak disebut sama sekali). LLM tinggal menyalin tiap kalimat ini apa
  // adanya jadi satu poin. SENGAJA tanpa tanda kurung "()" - pakai koma.
  const compactEntry = (entry: CheckpointCompliance): string | null => {
    const visible = visibleIndicators(entry);
    if (visible.length === 0) return null;
    const detail = visible.map((i) => `${i.label} ${i.detail}`).join(", ");
    const daysOverdue = maxDay - entry.group.activeFromDay;
    const overdueTag = daysOverdue > 0 ? `, sudah ${daysOverdue} hari lewat tenggat` : "";
    return `${entry.group.name}: ${detail}${overdueTag}.`;
  };

  // Checkpoint 1 (Sudah Dihubungi/komunikasi) SENGAJA dikecualikan di sini -
  // itu sudah dilaporkan tersendiri lewat buildCommunicationStatus (poin
  // komunikasi punya bagian sendiri di prompt), jadi kalau ikut dihitung di
  // sini juga, checkpoint yang sama bisa disebut DUA KALI (di poin komunikasi
  // DAN di poin "checkpoint lain").
  const problems = compliance.filter((c) => c.status === "belum-sesuai" && c.group.no !== 1);
  const todayLines = problems
    .filter((c) => todayOrMostRecentNos.has(c.group.no))
    .map(formatEntry)
    .filter((l): l is string => l !== null);
  // Checkpoint lain diurutkan dari yang PALING BARU jatuh tempo ke yang paling
  // lama - jadi checkpoint Dokumen Teknis (tenggat paling akhir) disebut duluan,
  // baru Dokumen Admin, baru Biodata/Perencana dst (tenggat paling awal) di
  // akhir. Ini kebalikan dari urutan alami CHECKPOINT_GROUPS (yang ascending
  // by activeFromDay) - koordinator lebih butuh lihat masalah TERBARU dulu,
  // bukan masalah yang sudah lama diketahui. Checkpoint yang sudah dilaporkan
  // lewat poin "checkpoint hari ini" (todayOrMostRecentNos, termasuk kalau itu
  // cuma fallback "paling recent") DIKECUALIKAN supaya tidak dobel.
  const previousProblems = problems
    .filter((c) => !todayOrMostRecentNos.has(c.group.no))
    .sort((a, b) => b.group.activeFromDay - a.group.activeFromDay || b.group.no - a.group.no);
  const previousLines = previousProblems.map(formatEntry).filter((l): l is string => l !== null);
  const previousItems = previousProblems.map(compactEntry).filter((l): l is string => l !== null);

  return {
    today: todayLines.length ? todayLines.join("\n") : "(checkpoint yang PERSIS jatuh tempo hari ini sudah Sesuai, atau tidak ada checkpoint baru jatuh tempo hari ini)",
    previous: previousLines.length ? previousLines.join("\n") : "(tidak ada checkpoint dari hari-hari sebelumnya yang masih Belum Sesuai)",
    previousItems,
  };
}

/** Nama + status checkpoint yang PERSIS jatuh tempo hari ini, APA ADANYA
 * (termasuk yang sudah Sesuai) - beda dari buildProblemCheckpoints yang
 * SENGAJA cuma berisi yang bermasalah. Dipakai supaya ringkasan WhatsApp
 * tetap kasih konteks "checkpoint hari ini apa" walau kebetulan sudah
 * Sesuai, bukan diam total soal itu.
 *
 * `todayOrMostRecent` = hasil todayOrMostRecentCheckpoints - kalau isinya
 * bukan checkpoint yang PERSIS jatuh tempo di `maxDay` (fallback "paling
 * recent"), tambahkan catatan itu supaya LLM tidak salah kira ini benar-benar
 * jatuh tempo hari ini. */
function buildTodayCheckpointStatus(maxDay: number, todayOrMostRecent: CheckpointCompliance[]): string {
  const formatStatus = (c: CheckpointCompliance) => {
    const label = c.status === "sesuai" ? "Sesuai" : c.status === "belum-sesuai" ? "Belum Sesuai" : "Tidak Ada Data";
    return `- [${c.group.no}. ${c.group.name}] ${label}`;
  };

  if (todayOrMostRecent.length === 0) return "(belum ada checkpoint yang berlaku sampai hari ini)";
  const isExactlyToday = todayOrMostRecent[0].group.activeFromDay === maxDay;
  if (isExactlyToday) return todayOrMostRecent.map(formatStatus).join("\n");

  const mostRecentDay = todayOrMostRecent[0].group.activeFromDay;
  return `(tidak ada checkpoint baru yang jatuh tempo persis hari ini - checkpoint PALING RECENT adalah yang jatuh tempo Hari ke-${mostRecentDay})\n${todayOrMostRecent.map(formatStatus).join("\n")}`;
}

/** Hari paling awal (mundur dari `maxDay`) di mana ISI TEKS MENTAH kolom
 * Kendala Komunikasi sudah IDENTIK PERSIS dengan kondisi saat ini - dipakai
 * untuk bilang "sejak Hari X" (durasi macetnya).
 *
 * SENGAJA membandingkan TEKS Kendala Komunikasi, BUKAN angka persentase
 * (% Sekolah Belum Dihubungi/Frekuensi Komunikasi) - kolom angka checkpoint
 * bisa kebaca "tidak berubah" sekian hari padahal itu cuma nilai
 * formula/snapshot yang ikut freeze, BUKAN bukti nyata tidak ada progres.
 * Teks Kendala Komunikasi jauh lebih informatif soal PROGRES SEBENARNYA -
 * mis. bedanya "Belum diisi status komunikasi SEMUA sekolah" (belum satupun
 * dihubungi) vs "...SEBAGIAN sekolah (3 dari 20)" (3 sudah, sisanya belum) -
 * begitu teksnya berubah (mis. angka "3 dari 20" jadi "10 dari 20"), streak
 * berhenti karena itu tandanya ADA progres, bukan macet total. */
function communicationStagnantSinceDay(history: FacilRow[], maxDay: number): number {
  const byHari = new Map(history.map((r) => [r.hari, r]));
  const current = byHari.get(maxDay);
  if (!current) return maxDay;
  const currentText = typeof current.kendalaKomunikasi === "string" ? current.kendalaKomunikasi.trim() : "";
  let since = maxDay;
  for (let h = maxDay - 1; h >= 1; h--) {
    const row = byHari.get(h);
    if (!row) break;
    const text = typeof row.kendalaKomunikasi === "string" ? row.kendalaKomunikasi.trim() : "";
    if (text !== currentText) break;
    since = h;
  }
  return since;
}

/** Status checkpoint 1 "Sudah Dihubungi" (komunikasi fasilitator ke sekolah) -
 * SELALU ditampilkan apa adanya (bukan cuma kalau bermasalah), karena admin
 * mau tahu progres komunikasi sebagai konteks awal terlepas dari sesuai/tidak.
 * SENGAJA fokus ke indikator KOMUNIKASI (% belum dihubungi, frekuensi
 * komunikasi) + isi TEKS Kendala Komunikasi mentah (supaya beda "semua" vs
 * "sebagian X dari Y sekolah" kelihatan jelas, bukan cuma angka persen) +
 * sejak hari berapa TEKS itu (bukan angka persen) terakhir berubah -
 * "Fasil Belum Login LK" TIDAK disertakan sebagai headline karena kurang
 * informatif (cuma bilang Sudah/Belum, tidak bilang sudah berapa lama).
 *
 * `hasFutureDataAnomaly` = true kalau kolom Kendala Komunikasi kena anomali
 * "future_data" (ada hari yang belum terjadi tapi sudah terisi, lihat
 * lib/anomalies.ts) - kalau begitu, streak "identik sejak Hari X" di bawah
 * SENGAJA tidak dihitung/ditampilkan. Riwayat kolom ini sendiri sudah
 * ditandai tidak bisa dipercaya, jadi klaim "belum ada progres sejak Hari X"
 * cuma mengulang ketidakpastian yang sama dengan framing lain (dan Hari X
 * yang dihasilkan bisa menyesatkan kalau ikut membandingkan ke baris masa
 * depan yang anomali) - cukup laporkan anomalinya saja. */
function buildCommunicationStatus(compliance: CheckpointCompliance[], history: FacilRow[], maxDay: number, hasFutureDataAnomaly: boolean): string {
  const comm = compliance.find((c) => c.group.no === 1);
  if (!comm) return "(checkpoint komunikasi belum berlaku pada hari ini)";
  const label = comm.status === "sesuai" ? "Sesuai" : comm.status === "belum-sesuai" ? "Belum Sesuai" : "Tidak Ada Data";
  const detail = comm.indicators
    .filter((i) => i.kolom !== "fasilBelumLoginLK")
    .map((i) => `${i.label}: ${i.detail}`)
    .join("; ");
  const latest = history[history.length - 1];
  const kendalaText = typeof latest.kendalaKomunikasi === "string" ? latest.kendalaKomunikasi.trim() : "";
  const kendalaNote = kendalaText !== "" ? ` | Isi TEKS Kendala Komunikasi saat ini: "${kendalaText}"` : ` | Kolom Kendala Komunikasi kosong`;
  const since = communicationStagnantSinceDay(history, maxDay);
  const sinceNote =
    !hasFutureDataAnomaly && since < maxDay
      ? ` - TEKS Kendala Komunikasi ini PERSIS SAMA sejak Hari ke-${since} (tidak berubah, indikasi tidak ada progres komunikasi baru sejak itu)`
      : "";
  return `[${label}] ${detail}${kendalaNote}${sinceNote}`;
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

/**
 * Prompt untuk tombol "Generate dengan AI" (panggilan API internal, lihat
 * app/api/analyze/facilitator/route.ts). Memakai data & instruksi yang SAMA
 * PERSIS dengan tombol "Copy Prompt" (buildFacilitatorCopyPromptText) -
 * disatukan 2026-07-22 (lihat catatan di buildFacilNarrativeData) supaya
 * kedua tombol menghasilkan gaya narasi yang identik walau modelnya beda
 * (satu manual paste ke Gemini, satu panggilan API internal). Bedanya cuma
 * bentuk output: di sini ChatMessage[] (system + user) untuk callLLM(),
 * bukan satu string siap-paste.
 */
export function buildFacilitatorAnalysisMessages(
  history: FacilRow[],
  options?: { anomalyFields?: Set<keyof FacilRow>; targetHari?: number; prevRow?: FacilRow | null }
): ChatMessage[] {
  if (history.length === 0) throw new Error("Tidak ada data histori untuk fasilitator ini.");
  // Cari baris untuk `targetHari` SPESIFIK (bukan asumsi "elemen terakhir
  // array = hari yang dimaksud") - `history` yang dikirim client bisa berisi
  // hari-hari SETELAH hari yang lagi dianalisis (mis. baris kosong hari
  // berikutnya yang sudah ter-generate otomatis di masterLog), jadi elemen
  // terakhir array TIDAK SELALU sama dengan hari target. Kalau ini diabaikan,
  // narasi bisa memakai data hari/log slot yang salah walau admin sudah
  // memilih Log 1/Log 2 yang benar di UI (lihat activeRow di
  // FacilitatorAnalysisWorkbench.tsx) - fallback ke elemen terakhir cuma
  // kalau targetHari tidak diberikan sama sekali.
  const maxDay = options?.targetHari ?? history[history.length - 1].hari;
  const latest = history.find((r) => r.hari === maxDay) ?? history[history.length - 1];
  const data = buildFacilNarrativeData(latest, maxDay, options?.prevRow);

  const userPrompt = `Tolong tulis analisis naratif untuk SATU fasilitator lapangan, PERSIS meniru gaya, struktur, dan urutan paragraf dari "CONTOH REFERENSI" di bawah - tapi SELURUH angka harus berasal dari "DATA FASILITATOR" (JSON) di bawahnya, JANGAN sekali-kali memakai angka dari contoh referensi.

=== CONTOH REFERENSI (tiru gaya & strukturnya, BUKAN angkanya) ===
${FACIL_NARRATIVE_REFERENCE_EXAMPLE}
=== AKHIR CONTOH REFERENSI ===

ATURAN WAJIB:
${FACIL_NARRATIVE_INSTRUCTIONS}

=== DATA FASILITATOR (SATU-SATUNYA sumber angka yang boleh dipakai) ===
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

${buildKnowledgeSummary(maxDay)}`;

  return [
    {
      role: "system",
      content:
        "Anda adalah asisten analis untuk program revitalisasi sekolah. Jawab dalam Bahasa Indonesia dengan analisis naratif objektif dan faktual, PERSIS mengikuti instruksi & gaya yang diberikan - tanpa opini, tanpa menyalahkan fasilitator.",
    },
    { role: "user", content: userPrompt },
  ];
}

export function buildDailySummaryMessages(dayRows: FacilRow[], hari: number, prevDayRows: FacilRow[] = []): ChatMessage[] {
  if (dayRows.length === 0) throw new Error("Tidak ada data untuk hari ini.");
  const sorted = [...dayRows].sort((a, b) => {
    const av = getEffectiveRisk(a).value ?? -1;
    const bv = getEffectiveRisk(b).value ?? -1;
    return bv - av;
  });

  const table = sorted
    .map((r) => {
      const belumSesuai = getCheckpointCompliance(r, hari)
        .filter((c) => c.status === "belum-sesuai")
        .map((c) => {
          let worst: { label: string; detail: string; tier: SeverityTier } | null = null;
          for (const i of c.indicators) {
            if (!i.gating) continue;
            const sev = indicatorSeverity(i, c.group);
            if (sev && (worst == null || TIER_RANK[sev] > TIER_RANK[worst.tier])) {
              worst = { label: i.label, detail: i.detail, tier: sev };
            }
          }
          return worst ? `${c.group.name} [${TIER_LABEL[worst.tier]} - ${worst.label}: ${worst.detail}]` : c.group.name;
        });
      const cpNote = belumSesuai.length > 0 ? `, Checkpoint belum sesuai: ${belumSesuai.join(", ")}` : ", Checkpoint belum sesuai: tidak ada";
      return `- ${r.namaFasil} (${r.kodeFasil}, koor: ${r.namaKoor}) - Nilai Risiko: ${formatRisk(r)}, Belum Login LK: ${formatCell(r.fasilBelumLoginLK)}, Belum Login Aplikasi: ${formatCell(r.pctSekolahBelumLoginAplikasi)}${cpNote}`;
    })
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

## Data Kuantitatif per Fasilitator (Nilai Risiko & checkpoint, diurutkan dari risiko tertinggi)
${table}

## Data Kualitatif dari Lapangan (catatan Kendala/Analisis Admin/Catatan Admin)
${notes || "(tidak ada catatan kualitatif tambahan)"}

## Perbandingan dengan Hari Sebelumnya (Hari ke-${hari - 1})
${buildOverallDayDiff(dayRows, prevDayRows, hari)}

Tolong tulis dalam format tiga bagian di bawah, TANPA label/judul di depan tiap kalimat - langsung isi kalimatnya, natural seperti manusia menulis catatan singkat (judul "##" section boleh tetap dipakai apa adanya). Poin 1, 3, 4, 5, 6 masing-masing satu kalimat ringkas (maksimal ~25 kata). Poin 2 BOLEH lebih dari satu kalimat kalau fasilitator prioritas itu punya banyak checkpoint Belum Sesuai - JANGAN mengorbankan kejelasan demi memaksakan satu kalimat:

## Analisis Kuantitatif
- Gambaran keseluruhan kinerja hari ini berdasar Nilai Risiko & status checkpoint, sertakan pola anomali menonjol kalau ada (mis. banyak fasilitator yang checkpoint-nya berulang kali tidak sesuai padahal sudah jatuh tempo, atau data Hasil LK vs Aplikasi yang tidak konsisten).
- Siapa yang paling butuh perhatian/intervensi segera. Untuk SETIAP checkpoint Belum Sesuai yang disebut, WAJIB pakai catatan "Checkpoint belum sesuai" di data APA ADANYA (nama indikator + angka + tingkat keparahannya) - DILARANG cuma menulis "NamaCheckpoint (Tingkat)" tanpa keterangan indikator. Sebut juga kalau ada fasilitator yang polanya menunjukkan cuma aktif di sisi Aplikasi (rajin login/isi form) tapi checkpoint substantif ke sekolah tidak kunjung maju (kesan asal isi/kurang proaktif verifikasi lapangan).
- Apa yang membaik/memburuk dibanding Hari ke-${hari - 1} (pakai bagian "Perbandingan dengan Hari Sebelumnya" di atas).

## Analisis Kualitatif
- Kendala paling menonjol yang berulang di banyak fasilitator, atau bilang tidak ada pola kendala umum kalau memang tidak ada.
- Hal penting lain dari catatan lapangan yang belum tercakup di poin sebelumnya, atau bilang tidak ada catatan tambahan kalau memang tidak ada.

## Rekomendasi
- Satu tindakan paling penting untuk hari ini/besok, sesuaikan urgensinya dengan tingkat keparahan checkpoint yang ada, mempertimbangkan analisis kuantitatif maupun kualitatif di atas.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

// --- Prompt untuk tombol "Copy Prompt" (paste manual ke Gemini Pro dkk.) --

/** Total sekolah dan dokumen dinamis per fasilitator berdasar kolom
 * "Total Sekolah" dari sheet roster master (atau default 20 jika kosong).
 * Proporsi: 6 dokumen teknis & 11 dokumen admin per sekolah.
 * SELALU dipakai apa adanya untuk SETIAP metrik terkait (unggah/verifikasi/sesuai),
 * TIDAK dirantai dari hasil metrik sebelumnya (mis. jumlah terverifikasi BUKAN
 * dihitung dari jumlah terunggah, keduanya independen dari total ini) -
 * dikonfirmasi eksplisit oleh program owner 2026-07-18. */
function getFacilitatorTotals(row: FacilRow) {
  const totalSekolah = row.totalSekolah && row.totalSekolah > 0 ? row.totalSekolah : 20;
  return {
    totalSekolah,
    totalDokTeknis: totalSekolah * 6,
    totalDokAdmin: totalSekolah * 11,
  };
}

function numOrZero(v: FacilRow[keyof FacilRow]): number {
  return typeof v === "number" ? v : 0;
}

function absFromPct(v: FacilRow[keyof FacilRow], total: number): number {
  return Math.round((numOrZero(v) / 100) * total);
}

/** Persentase "sudah" dari kolom sumber yang berupa persentase "belum" -
 * DIHITUNG DI KODE (bukan diserahkan ke LLM), karena LLM eksternal (Gemini
 * dkk) terbukti kadang salah membalik arah persen ini sendiri (mis. melabeli
 * ulang angka "belum" sebagai "sudah" tanpa benar-benar menghitung 100-x,
 * menghasilkan narasi yang kontradiktif dengan jumlah sekolah "belum" yang
 * disebut di kalimat yang sama). */
function invertPct(v: FacilRow[keyof FacilRow]): number {
  return parseFloat((100 - numOrZero(v)).toFixed(2));
}

function kendalaTextOrEmpty(v: FacilRow[keyof FacilRow]): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  return trimmed === "" || trimmed === "Belum Diisi" ? "" : trimmed;
}

const KENDALA_FIELDS_FOR_STALL_CHECK: (keyof FacilRow)[] = [
  "kendalaKomunikasi",
  "kendalaPanlakFormatTemplate",
  "kendalaMendapatkanPerencana",
  "kendalaVerifikasiBiodata",
  "kendalaUpdateDapodik",
  "kendalaPenyusunanDokAdmin",
  "kendalaVerifikasiDokAdmin",
  "kendalaPenyusunanDokTeknis",
  "kendalaVerifikasiDokTeknis",
  "kendalaPenyepakatanRAB",
];

/** "sampai Hari ke-N" di kolom Kendala manapun - dipakai admin sebagai catatan
 * manual kalau fasilitator berhenti mengisi LK sebelum hari ini (mis. "Baru
 * mengisi sampai Hari ke-11 (harusnya sudah Hari ke-13)"). */
const STALL_NOTE_PATTERN = /sampai\s+hari\s+ke-?\s*(\d+)/i;

/**
 * "Hari terakhir fasilitator ini BENERAN mengisi LK Fasil" - BUKAN row.hari!
 * row.hari di tab "masterLog" itu artinya "hari yang direpresentasikan
 * snapshot ini" (SAMA untuk SEMUA fasilitator dalam satu snapshot) - BUKAN
 * "hari terakhir fasilitator ini update", beda dari arsitektur lama (tab
 * "Log" per fasilitator) yang row.hari-nya memang berarti begitu.
 * DIKONFIRMASI 2026-07-20 oleh program owner: tab ini TIDAK punya histori
 * per-hari sama sekali - setiap kali ditarik, isinya cuma kondisi TERKINI
 * sheet fasilitator itu (auto-pull dari spreadsheet lain), jadi TIDAK ADA
 * cara membandingkan "berubah/tidak dari hari sebelumnya" seperti
 * streakStartDay di atas. Satu-satunya sinyal "fasilitator ini macet sejak
 * hari X" yang tersedia adalah catatan manual admin di kolom Kendala (pola
 * "sampai Hari ke-N", SELALU dituliskan admin sebagai "...(harusnya sudah
 * Hari ke-{TOTAL_HARI_SIKLUS})" - dikonfirmasi dari contoh kendala asli,
 * TOTAL_HARI_SIKLUS itu target/batas TETAP pengisian LK Fasil, BUKAN
 * dihitung dari `hari`/kalender saat ini yang bisa lebih dari
 * TOTAL_HARI_SIKLUS). KALAU tidak ketemu pola itu di kolom manapun, artinya
 * TIDAK ADA yang melaporkan dia macet - fallback ke TOTAL_HARI_SIKLUS
 * (anggap sudah mengisi penuh sampai batas akhir), BUKAN suatu klaim macet. */
function findLastFilledDay(row: FacilRow): number {
  for (const key of KENDALA_FIELDS_FOR_STALL_CHECK) {
    const text = kendalaTextOrEmpty(row[key]);
    const match = text.match(STALL_NOTE_PATTERN);
    if (match) return parseInt(match[1], 10);
  }
  return TOTAL_HARI_SIKLUS;
}

const FACIL_NARRATIVE_REFERENCE_EXAMPLE = `Fasil ini hanya mengisi LK Fasil sampai hari ke-4.
Terdapat 1 sekolah yang mengundurkan diri.

Nilai capaian fasil atas Muhammad Haditya Yervan berada di angka 26.41 karena banyak checkpoint yang capaiannya masih rendah. Tidak ada perubahan/perkembangan dari hari kemarin, tetap di angka 26.41.

Checkpoint wajib untuk hari ke-12 yaitu seluruh sekolah telah sepakat RAB. Namun, hingga hari ke-20 ini, masih terdapat 19 sekolah yang belum sepakat RAB (100%). Beberapa hal yang berpengaruh terhadap capaian tersebut adalah belum tercapainya checkpoint perencana dan rendahnya angka unggah dan verifikasi dokumen teknis. Ada perubahan dari hari kemarin, dari angka 89.47% turun menjadi 0%.

Perencana: Masih ada 14 sekolah yang belum memiliki perencana sehingga sekolah belum dapat menyelesaikan penyusunan dokumen admin dan memulai menyusun dokumen teknis. Kendala terkait perencana tidak teridentifikasi karena fasil tidak mengisi informasi terkait perencana di LK Fasil.

Unggah dokumen teknis: Baru sekitar 16 dari 120 dokumen teknis yang terunggah (14.04% rata-rata dokumen teknis terunggah). Artinya masih sekitar 104 dokumen yang harus ditagih untuk segera diunggah. Angka minimal persen terunggah menunjukan masih adanya sekolah yang belum mengunggah satupun dokumen (0% minimal dokumen teknis terunggah). Kendala terkait unggah dokumen teknis tidak teridentifikasi karena fasil tidak mengisi informasi terkait hal di LK Fasil.

Verifikasi dokumen teknis: Dari sekitar 16 dokumen teknis yang terunggah, belum ada dokumen teknis yang terverifikasi oleh fasil (0% rata-rata dok. teknis terverifikasi). Kendala terkait verifikasi dokumen teknis tidak teridentifikasi karena fasil tidak mengisi informasi terkait hal ini di LK Fasil.

Unggah dokumen admin: Baru sekitar 150 dari 220 dokumen admin yang terunggah (68.42% rata-rata dokumen admin terunggah). Artinya masih sekitar 70 dokumen yang harus ditagih untuk segera diunggah. Angka minimal persen terunggah menunjukan adanya sekolah yang belum mengunggah sama sekali dari 11 dokumen (0% minimal dokumen admin terunggah). Kendala terkait unggah dokumen admin adalah dokumen belum tersedia lengkap di sekolah (Sumber: LK Fasil).

Verifikasi dokumen admin: Dari sekitar 150 dokumen admin yang terunggah, yang sudah terverifikasi oleh fasil sekitar 76 dokumen (51.20% rata-rata dokumen admin terverifikasi). Artinya masih sekitar 74 dokumen admin yang harus segera diverifikasi. Ada perubahan dari hari kemarin, dari angka 65.20% turun menjadi 51.20%.

Verifikasi dokumen admin "Sesuai": Dari sekitar 76 dokumen admin yang terverifikasi oleh fasil, baru sekitar 35 dokumen admin yang terverifikasi dengan status "Sesuai" (46.89% rata dokumen admin terverifikasi "Sesuai").

Catatan lain:
Biodata: Masih 8 sekolah yang belum terverifikasi "Sesuai" biodatanya (63.16% sekolah biodata sudah terverifikasi sesuai).
Dapodik: Seluruh sekolah yang data dapodiknya belum sesuai rincian menu yang dibutuhkan tidak bisa mengupdate Dapodik dikarenakan Dapodik terkunci (Sumber: LK Fasil). Ada perubahan dari hari kemarin, dari angka 20.0% turun menjadi 15.0%.`;

/**
 * Data & instruksi naratif BERSAMA untuk SATU fasilitator - dipakai baik oleh
 * buildFacilitatorAnalysisMessages() (tombol "Generate dengan AI"/panggilan
 * API internal) MAUPUN buildFacilitatorCopyPromptText() (tombol "Copy Prompt"
 * untuk paste manual ke Gemini Pro dkk). Sebelumnya dua tombol ini punya gaya
 * output BERBEDA TOTAL (ringkas 1 kalimat/poin vs narasi panjang per
 * kategori) - disatukan 2026-07-22 atas permintaan program owner supaya
 * hasil "Generate dengan AI" dan "Copy Prompt" konsisten (model LLM-nya sama,
 * jangan sampai instruksinya beda).
 */
/** Persentase & jumlah sekolah yang BELUM mencapai target indikator UTAMA
 * (indicators[0]) suatu checkpoint - dipakai untuk kalimat "Namun, hingga
 * hari ke-X ini, terdapat N sekolah yang belum ..." (lihat FACIL_NARRATIVE_INSTRUCTIONS
 * poin 1c). DIHITUNG DI KODE (bukan diserahkan ke LLM) mengikuti pola yang
 * sama dengan field lain di file ini - LLM tinggal menyalin angkanya.
 * polarity "higherIsBetter" berarti nilaiSheet ITU SENDIRI sudah "% sudah
 * tercapai" (perlu dibalik 100-x jadi "% belum"), sebaliknya (default/
 * "higherIsWorse") nilaiSheet SUDAH berupa "% belum" langsung. */
function belumMencapaiFor(indicator: CheckpointIndicator, row: FacilRow, totalSekolah: number): { persen: number; jumlah: number } {
  const persen = indicator.polarity === "higherIsBetter" ? invertPct(row[indicator.kolom]) : numOrZero(row[indicator.kolom]);
  return { persen, jumlah: absFromPct(persen, totalSekolah) };
}

function buildFacilNarrativeDataBase(row: FacilRow, hari: number) {
  const { totalSekolah, totalDokTeknis, totalDokAdmin } = getFacilitatorTotals(row);
  const compliance = getCheckpointCompliance(row, hari);
  const dueCheckpoints = activeCheckpoints(hari); // urut ascending activeFromDay
  const currentGroup = dueCheckpoints[dueCheckpoints.length - 1] ?? null; // checkpoint PALING BARU jatuh tempo
  const currentCompliance = currentGroup ? compliance.find((c) => c.group.no === currentGroup.no) ?? null : null;

  const hariTerakhirDiisiFasil = findLastFilledDay(row);
  const barisPembukaMacet =
    hariTerakhirDiisiFasil < TOTAL_HARI_SIKLUS ? `Fasil ini hanya mengisi LK Fasil sampai hari ke-${hariTerakhirDiisiFasil}.` : null;
  const mengundurkanDiriNum = parseInt(String(row.jumlahSekolahMengundurkanDiri || "0"), 10);
  const barisMengundurkanDiri =
    mengundurkanDiriNum > 0 ? `Terdapat ${mengundurkanDiriNum} sekolah yang mengundurkan diri.` : null;

  const belumMencapai = currentGroup ? belumMencapaiFor(currentGroup.indicators[0], row, totalSekolah) : null;

  return {
    fasilitator: row.namaFasil,
    kodeFasil: row.kodeFasil,
    hariIni: hari,
    barisPembukaMacet,
    barisMengundurkanDiri,
    skorAkhir: typeof row.skorAkhir === "number" ? row.skorAkhir : null,
    checkpointWajibHariIni: currentGroup
      ? {
        nama: currentGroup.name,
        tujuan: currentGroup.tujuan,
        aktifSejakHari: currentGroup.activeFromDay,
        statusSaatIni: currentCompliance?.status ?? "unknown",
        indikator: currentGroup.indicators.map((i) => ({ label: i.definisi, nilaiSheet: row[i.kolom] })),
        belumMencapaiPersen: belumMencapai!.persen,
        belumMencapaiJumlah: belumMencapai!.jumlah,
      }
      : "(belum ada checkpoint yang berlaku sampai hari ini)",
    sekolahLoginAplikasi: {
      totalSekolah: totalSekolah,
      belumLoginPersen: numOrZero(row.pctSekolahBelumLoginAplikasi),
      belumLoginJumlah: absFromPct(row.pctSekolahBelumLoginAplikasi, totalSekolah),
      sudahLoginPersen: invertPct(row.pctSekolahBelumLoginAplikasi),
    },
    perencana: {
      totalSekolah: totalSekolah,
      belumPunyaPersen: numOrZero(row.pctTidakPunyaPerencanaLK),
      belumPunyaJumlah: absFromPct(row.pctTidakPunyaPerencanaLK, totalSekolah),
      sudahPunyaPersen: invertPct(row.pctTidakPunyaPerencanaLK),
      kendala: kendalaTextOrEmpty(row.kendalaMendapatkanPerencana),
    },
    dokumenTeknis: {
      totalDokumen: totalDokTeknis,
      unggahPersen: numOrZero(row.rataDokTeknisTerunggah),
      unggahJumlah: absFromPct(row.rataDokTeknisTerunggah, totalDokTeknis),
      unggahMinimalPersen: numOrZero(row.minDokTeknisTerunggah),
      kendalaUnggah: kendalaTextOrEmpty(row.kendalaPenyusunanDokTeknis),
      verifikasiPersen: numOrZero(row.rataDokTeknisTerverifikasi),
      verifikasiJumlah: absFromPct(row.rataDokTeknisTerverifikasi, totalDokTeknis),
      kendalaVerifikasi: kendalaTextOrEmpty(row.kendalaVerifikasiDokTeknis),
      sesuaiPersen: numOrZero(row.rataDokTeknisSesuai),
      sesuaiJumlah: absFromPct(row.rataDokTeknisSesuai, totalDokTeknis),
    },
    dokumenAdmin: {
      totalDokumen: totalDokAdmin,
      unggahPersen: numOrZero(row.rataDokAdminTerunggah),
      unggahJumlah: absFromPct(row.rataDokAdminTerunggah, totalDokAdmin),
      unggahMinimalPersen: numOrZero(row.minDokAdminTerunggah),
      kendalaUnggah: kendalaTextOrEmpty(row.kendalaPenyusunanDokAdmin),
      verifikasiPersen: numOrZero(row.rataDokAdminTerverifikasi),
      verifikasiJumlah: absFromPct(row.rataDokAdminTerverifikasi, totalDokAdmin),
      kendalaVerifikasi: kendalaTextOrEmpty(row.kendalaVerifikasiDokAdmin),
      sesuaiPersen: numOrZero(row.rataDokAdminSesuai),
      sesuaiJumlah: absFromPct(row.rataDokAdminSesuai, totalDokAdmin),
    },
    catatanLain: {
      biodata: {
        totalSekolah: totalSekolah,
        belumTerverifikasiPersen: numOrZero(row.pctBiodataBelumTerverifikasi),
        belumTerverifikasiJumlah: absFromPct(row.pctBiodataBelumTerverifikasi, totalSekolah),
        sudahTerverifikasiPersen: invertPct(row.pctBiodataBelumTerverifikasi),
        kendala: kendalaTextOrEmpty(row.kendalaVerifikasiBiodata),
      },
      dapodik: {
        sudahUploadBuktiPersen: numOrZero(row.pctSudahUploadBuktiUpdateDapodik),
        kendala: kendalaTextOrEmpty(row.kendalaUpdateDapodik),
      },
      komunikasi: { belumDihubungiPersen: numOrZero(row.pctSekolahBelumDihubungi), kendala: kendalaTextOrEmpty(row.kendalaKomunikasi) },
      panlakFormat: {
        belumPanlakPersen: numOrZero(row.pctTidakPunyaPanlak),
        belumFormatPersen: numOrZero(row.pctTidakPunyaFormatTemplate),
        kendala: kendalaTextOrEmpty(row.kendalaPanlakFormatTemplate),
      },
      rab: { belumSepakatPersen: numOrZero(row.pctBelumSepakatRAB), kendala: kendalaTextOrEmpty(row.kendalaPenyepakatanRAB) },
    },
  };
}

/** Perbandingan untuk Skor Akhir (Nilai capaian fasil) - SELALU ditampilkan
 * baik naik, turun, maupun tetap, karena skor akhir memberi konteks performa
 * keseluruhan di hari berjalan. */
function bandingSkorAkhir(currRaw: number, prevRaw: number | null): string {
  const curr = parseFloat(currRaw.toFixed(2));
  if (prevRaw == null) return `Tidak ada data hari sebelumnya untuk dibandingkan (saat ini ${curr}%).`;
  const prev = parseFloat(prevRaw.toFixed(2));
  const diff = parseFloat((curr - prev).toFixed(2));
  if (Math.abs(diff) < 0.05) return `Tidak ada perubahan/perkembangan dari hari kemarin, tetap di angka ${curr}%.`;
  const arah = diff > 0 ? "naik" : "turun";
  return `Ada perubahan dari hari kemarin, dari angka ${prev}% ${arah} menjadi ${curr}%.`;
}

/** Perbandingan untuk tiap indikator/checkpoint - HANYA mengembalikan kalimat
 * perbandingan JIKA mengalami PENURUNAN capaian (turun) dibanding hari
 * sebelumnya. Jika persentase capaian tetap sama atau naik (membaik),
 * mengembalikan null supaya kalimat pembanding tidak ditampilkan sama sekali. */
function bandingCapaianIndikator(currCapaianRaw: number | null | undefined, prevCapaianRaw: number | null | undefined): string | null {
  if (currCapaianRaw == null || prevCapaianRaw == null) return null;
  const curr = parseFloat(currCapaianRaw.toFixed(2));
  const prev = parseFloat(prevCapaianRaw.toFixed(2));
  const diff = parseFloat((curr - prev).toFixed(2));
  // Jika tidak turun (tetap atau naik), tidak usah dimention perubahannya
  if (diff >= -0.04) return null;
  return `Ada perubahan dari hari kemarin, dari angka ${prev}% turun menjadi ${curr}%.`;
}

type FacilNarrativeBase = ReturnType<typeof buildFacilNarrativeDataBase>;

/** Tempel field "...BandingHariSebelumnya" di tiap kategori metrik. `prev` null
 * kalau tidak ada pembanding Log slot yang sama di hari sebelumnya.
 * Catatan: Untuk indikator, angka yang dibandingkan selalu '% sudah/capaian',
 * sehingga 'turun' berarti penurunan pencapaian positif. */
function withDayOverDayDeltas(base: FacilNarrativeBase, prev: FacilNarrativeBase | null) {
  const prevCp = prev && typeof prev.checkpointWajibHariIni === "object" ? prev.checkpointWajibHariIni : null;
  const currCp = typeof base.checkpointWajibHariIni === "object" ? base.checkpointWajibHariIni : null;
  const invert = (val: number | null | undefined) => (val == null ? null : parseFloat((100 - val).toFixed(2)));

  return {
    ...base,
    skorAkhirBandingHariSebelumnya:
      base.skorAkhir != null && prev?.skorAkhir != null ? bandingSkorAkhir(base.skorAkhir, prev.skorAkhir) : "Tidak ada data hari sebelumnya untuk dibandingkan.",
    checkpointWajibHariIni: currCp
      ? { ...currCp, bandingHariSebelumnya: bandingCapaianIndikator(invert(currCp.belumMencapaiPersen), invert(prevCp?.belumMencapaiPersen)) }
      : base.checkpointWajibHariIni,
    sekolahLoginAplikasi: {
      ...base.sekolahLoginAplikasi,
      bandingHariSebelumnya: bandingCapaianIndikator(base.sekolahLoginAplikasi.sudahLoginPersen, prev?.sekolahLoginAplikasi.sudahLoginPersen),
    },
    perencana: {
      ...base.perencana,
      bandingHariSebelumnya: bandingCapaianIndikator(base.perencana.sudahPunyaPersen, prev?.perencana.sudahPunyaPersen),
    },
    dokumenTeknis: {
      ...base.dokumenTeknis,
      unggahBandingHariSebelumnya: bandingCapaianIndikator(base.dokumenTeknis.unggahPersen, prev?.dokumenTeknis.unggahPersen),
      verifikasiBandingHariSebelumnya: bandingCapaianIndikator(base.dokumenTeknis.verifikasiPersen, prev?.dokumenTeknis.verifikasiPersen),
      sesuaiBandingHariSebelumnya: bandingCapaianIndikator(base.dokumenTeknis.sesuaiPersen, prev?.dokumenTeknis.sesuaiPersen),
    },
    dokumenAdmin: {
      ...base.dokumenAdmin,
      unggahBandingHariSebelumnya: bandingCapaianIndikator(base.dokumenAdmin.unggahPersen, prev?.dokumenAdmin.unggahPersen),
      verifikasiBandingHariSebelumnya: bandingCapaianIndikator(base.dokumenAdmin.verifikasiPersen, prev?.dokumenAdmin.verifikasiPersen),
      sesuaiBandingHariSebelumnya: bandingCapaianIndikator(base.dokumenAdmin.sesuaiPersen, prev?.dokumenAdmin.sesuaiPersen),
    },
    catatanLain: {
      ...base.catatanLain,
      biodata: {
        ...base.catatanLain.biodata,
        bandingHariSebelumnya: bandingCapaianIndikator(base.catatanLain.biodata.sudahTerverifikasiPersen, prev?.catatanLain.biodata.sudahTerverifikasiPersen),
      },
      dapodik: {
        ...base.catatanLain.dapodik,
        bandingHariSebelumnya: bandingCapaianIndikator(base.catatanLain.dapodik.sudahUploadBuktiPersen, prev?.catatanLain.dapodik.sudahUploadBuktiPersen),
      },
      komunikasi: {
        ...base.catatanLain.komunikasi,
        bandingHariSebelumnya: bandingCapaianIndikator(invert(base.catatanLain.komunikasi.belumDihubungiPersen), invert(prev?.catatanLain.komunikasi.belumDihubungiPersen)),
      },
      panlakFormat: {
        ...base.catatanLain.panlakFormat,
        panlakBandingHariSebelumnya: bandingCapaianIndikator(invert(base.catatanLain.panlakFormat.belumPanlakPersen), invert(prev?.catatanLain.panlakFormat.belumPanlakPersen)),
        formatBandingHariSebelumnya: bandingCapaianIndikator(invert(base.catatanLain.panlakFormat.belumFormatPersen), invert(prev?.catatanLain.panlakFormat.belumFormatPersen)),
      },
      rab: {
        ...base.catatanLain.rab,
        bandingHariSebelumnya: bandingCapaianIndikator(invert(base.catatanLain.rab.belumSepakatPersen), invert(prev?.catatanLain.rab.belumSepakatPersen)),
      },
    },
  };
}

/**
 * Data & instruksi naratif BERSAMA untuk SATU fasilitator (lihat
 * buildFacilNarrativeDataBase untuk field-field intinya). `prevRow` = FacilRow
 * Log SLOT YANG SAMA (Log 1/Log 2) di HARI SEBELUMNYA persis (bukan hari
 * sebelumnya sembarang slot) - null/undefined kalau tidak ada (mis. Hari 1,
 * atau admin belum pernah isi slot itu kemarin). Dipakai untuk field
 * "...BandingHariSebelumnya" di tiap kategori metrik (lihat withDayOverDayDeltas)
 * supaya narasi bisa bilang "naik/turun dari X% ke Y%" atau "tidak ada
 * perubahan" - dihitung DI KODE, LLM tinggal menyalin kalimatnya.
 */
function buildFacilNarrativeData(row: FacilRow, hari: number, prevRow?: FacilRow | null) {
  const base = buildFacilNarrativeDataBase(row, hari);
  const prev = prevRow ? buildFacilNarrativeDataBase(prevRow, prevRow.hari) : null;
  const result = withDayOverDayDeltas(base, prev);

  // Filter dinamis: Hapus kategori & item catatanLain yang sudah mencapai target 100% (0% masalah)
  // dan tidak memiliki kendala dari JSON agar LLM sama sekali tidak membahasnya di analisis.
  const cleaned: Record<string, any> = { ...result };

  if (result.sekolahLoginAplikasi && result.sekolahLoginAplikasi.belumLoginPersen === 0) {
    delete cleaned.sekolahLoginAplikasi;
  }
  if (result.perencana && result.perencana.belumPunyaPersen === 0 && !result.perencana.kendala) {
    delete cleaned.perencana;
  }
  if (
    result.dokumenTeknis &&
    result.dokumenTeknis.unggahPersen === 100 &&
    result.dokumenTeknis.verifikasiPersen === 100 &&
    result.dokumenTeknis.sesuaiPersen === 100 &&
    !result.dokumenTeknis.kendalaUnggah &&
    !result.dokumenTeknis.kendalaVerifikasi
  ) {
    delete cleaned.dokumenTeknis;
  }
  if (
    result.dokumenAdmin &&
    result.dokumenAdmin.unggahPersen === 100 &&
    result.dokumenAdmin.verifikasiPersen === 100 &&
    result.dokumenAdmin.sesuaiPersen === 100 &&
    !result.dokumenAdmin.kendalaUnggah &&
    !result.dokumenAdmin.kendalaVerifikasi
  ) {
    delete cleaned.dokumenAdmin;
  }

  if (result.catatanLain) {
    const cl: Record<string, any> = { ...result.catatanLain };
    if (cl.biodata && cl.biodata.belumTerverifikasiPersen === 0 && !cl.biodata.kendala) {
      delete cl.biodata;
    }
    if (cl.dapodik && cl.dapodik.sudahUploadBuktiPersen === 100 && !cl.dapodik.kendala) {
      delete cl.dapodik;
    }
    if (cl.komunikasi && cl.komunikasi.belumDihubungiPersen === 0 && !cl.komunikasi.kendala) {
      delete cl.komunikasi;
    }
    if (cl.panlakFormat && cl.panlakFormat.belumPanlakPersen === 0 && cl.panlakFormat.belumFormatPersen === 0 && !cl.panlakFormat.kendala) {
      delete cl.panlakFormat;
    }
    if (cl.rab && cl.rab.belumSepakatPersen === 0 && !cl.rab.kendala) {
      delete cl.rab;
    }

    if (Object.keys(cl).length === 0) {
      delete cleaned.catatanLain;
    } else {
      cleaned.catatanLain = cl;
    }
  }

  return cleaned;
}

/** ATURAN WAJIB naratif fasilitator - dipakai APA ADANYA baik oleh
 * buildFacilitatorAnalysisMessages() maupun buildFacilitatorCopyPromptText()
 * (lihat catatan di buildFacilNarrativeData di atas soal kenapa disatukan). */
const FACIL_NARRATIVE_INSTRUCTIONS = `1. Ikuti urutan paragraf PERSIS seperti contoh: (a) baris pembuka - lihat field "barisPembukaMacet" dan "barisMengundurkanDiri" di data: KALAU "barisPembukaMacet" berisi teks, salin teks itu APA ADANYA sebagai baris pembuka (JANGAN diubah satu kata pun); KALAU null, LEWATI baris pembuka ini SEPENUHNYA. KALAU "barisMengundurkanDiri" berisi teks, salin teks itu APA ADANYA tepat di bawah baris pembuka macet (atau paling atas jika barisPembukaMacet null); KALAU null, lewati sepenuhnya. PERINGATAN KERAS: barisPembukaMacet null artinya fasil SUDAH mengisi PENUH sampai batas akhir siklus - ini BUKAN kendala/keterlambatan. JANGAN PERNAH mengarang sendiri kalimat sejenis "Fasil ini hanya/baru mengisi LK Fasil sampai hari ke-X" dari data lain manapun di JSON ini kalau barisPembukaMacet null - itu HALUSINASI, (b) baris "Nilai capaian fasil atas [Nama] berada di angka [Skor Akhir] karena ..." - HANYA sebutkan angkanya lalu langsung jelaskan alasannya (grounded ke checkpoint/data yang bermasalah). JANGAN tempelkan kata sifat/label kualitatif APAPUN ke skor itu sendiri buat menilai/mengkategorikannya (dilarang keras variasi: "(masuk kriteria ...)", "tergolong rendah/cukup/baik", dsb). Tutup baris ini dengan SATU kalimat tambahan berisi field top-level "skorAkhirBandingHariSebelumnya" APA ADANYA (untuk Skor Akhir, perbandingan hari kemarin SELALU disebutkan baik naik, turun, maupun tetap), (c) paragraf "Checkpoint wajib untuk hari ke-X yaitu ...", X WAJIB diambil PERSIS dari field "checkpointWajibHariIni.aktifSejakHari" di data (hari checkpoint ini MULAI berlaku/jatuh tempo). Setelah "yaitu", jelaskan checkpoint yang sedang berlaku dan status pencapaiannya, tutup dengan menyebutkan SPESIFIK checkpoint/kategori mana yang jadi penyebab utama. JANGAN menjelaskan definisi/tujuan monitoring checkpoint tsb. SEGERA setelah kalimat "yaitu ..." itu, WAJIB tambahkan SATU kalimat lagi berpola "Namun, hingga hari ke-{hariIni} ini, masih terdapat {checkpointWajibHariIni.belumMencapaiJumlah} sekolah yang belum [target] ({checkpointWajibHariIni.belumMencapaiPersen}%)." (kalau 0, lewati/ganti kalimat positif). Akhiri paragraf checkpoint ini dengan field "checkpointWajibHariIni.bandingHariSebelumnya" APA ADANYA (lihat poin 9: HANYA jika tidak null).
2. SETELAH itu, bahas kategori-kategori berikut yang RELEVAN (lihat poin 3), satu paragraf per kategori, SATU PER SATU dengan urutan dan label PERSIS ini kalau memang dibahas (pakai tanda kutip dua untuk kata "Sesuai"): "Sekolah login aplikasi:", "Perencana:", "Unggah dokumen teknis:", "Verifikasi dokumen teknis:", "Verifikasi dokumen teknis "Sesuai":", "Unggah dokumen admin:", "Verifikasi dokumen admin:", "Verifikasi dokumen admin "Sesuai":".
3. Tiap kategori di poin 2 HANYA dibahas KALAU kategori tersebut MUNCUL di dalam data JSON (sistem telah membatasi JSON agar hanya berisi kategori dengan capaian DI BAWAH 100%/bermasalah). KALAU sebuah kategori TIDAK ADA/HILANG dari data JSON, artinya capaiannya SUDAH 100%/sempurna. LEWATI kategori itu SEPENUHNYA - jangan disebut sama sekali, dan jangan juga menuliskan kalimat pengganti seperti "seluruhnya sudah ...". Cukup abaikan dan langsung ke poin berikutnya.
4. Kalau ada kolom "kendala..." yang isinya bukan string kosong di data, sertakan isinya apa adanya sebagai kalimat kendala di paragraf terkait. Kalau kosong, tulis kalimat seperti pada contoh ("Kendala terkait ... tidak teridentifikasi karena fasil tidak mengisi informasi terkait hal ini di LK Fasil").
5. Kalau ada ketimpangan besar antara satu tahap dan tahap berikutnya dalam kategori yang sama (mis. banyak yang terunggah tapi sedikit yang terverifikasi), sertakan juga angka selisihnya secara eksplisit di kalimatnya.
5b. Untuk kalimat yang menyebut persentase "sudah" sebagai pasangan dari angka "belum", WAJIB pakai field "sudahLoginPersen"/"sudahPunyaPersen"/"sudahTerverifikasiPersen" APA ADANYA dari data JSON - JANGAN menghitung sendiri (100 - persen belum).
6. WAJIB tutup dengan bagian "Catatan lain:" (judul PERSIS begitu, tanpa paragraf lain di atasnya dulu) - HANYA KALA key "catatanLain" ada di dalam data JSON dan BERISI minimal satu item. Jika key "catatanLain" TIDAK ADA di JSON, LEWATI SELURUH bagian "Catatan lain" ini termasuk judulnya. Jika key "catatanLain" ada, tulis baris-baris singkat HANYA UNTUK ITEM YANG ADA di dalam object catatanLain pada JSON tersebut (mis. jika di JSON cuma ada "komunikasi", maka BAHAS KOMUNIKASI SAJA). Item yang hilang/tidak ada dari JSON (seperti biodata, dapodik, komunikasi, panlakFormat, rab yang sudah dicoret sistem karena mencapai 100%) DILARANG KERAS dibahas atau dipaksa ditulis! (Mengundurkan diri SUDAH dipindahkan ke atas di poin 1a, jangan ditulis di sini).
7. Data dari field "kendala..." yang kosong ("") berarti memang belum ada catatan dari fasilitator - JANGAN mengarang kendala yang tidak ada di data.
8. Tulis paragraf mengalir natural (bukan bullet point/list), Bahasa Indonesia, TANPA judul tebal markdown di depan tiap paragraf.
9. ATURAN PERUBAHAN DARI HARI KEMARIN (SANGAT PENTING): Untuk setiap indikator/kategori (baik itu paragraf checkpoint poin 1c, kategori di poin 2, atau baris di "Catatan lain" poin 6), perhatikan field "...BandingHariSebelumnya" terkait di data JSON. Field tersebut HANYA akan bernilai teks jika capaian mengalami PENURUNAN (turun) dibanding hari kemarin. KALAU field tersebut berisi string, salin kalimat perbandingan itu APA ADANYA di akhir paragraf/baris terkait. KALAU field tersebut bernilai null (karena persentase capaiannya sama seperti kemarin atau angkanya naik), TIDAK USAH DIMENTION perubahannya! JANGAN masukkan kalimat pembanding apapun tentang hari kemarin di akhir paragraf tersebut (DILARANG KERAS merangkai frasa seperti "Tidak ada perubahan/perkembangan...", "tetap di angka...", atau "Ada perubahan... naik menjadi..."). Cukup akhiri paragraf seolah tidak ada pembandingan. (Ingat: pengecualian HANYA untuk Nilai Capaian / Skor Akhir di poin 1b, di mana skorAkhirBandingHariSebelumnya SELALU ditampilkan baik naik, turun, maupun tetap).`;

/**
 * Prompt untuk tombol "Copy Prompt" (FacilitatorAnalysisWorkbench.tsx) - untuk
 * admin yang mau paste manual ke Gemini Pro (atau chat LLM lain). Memakai
 * data & instruksi yang SAMA PERSIS dengan buildFacilitatorAnalysisMessages()
 * (lihat buildFacilNarrativeData/FACIL_NARRATIVE_INSTRUCTIONS di atas) -
 * bedanya cuma bentuk output: di sini satu string utuh siap paste (dengan
 * kalimat intro pembuka), sedangkan buildFacilitatorAnalysisMessages()
 * mengembalikan ChatMessage[] (system + user) untuk panggilan API internal.
 */
export function buildFacilitatorCopyPromptText(row: FacilRow, hari: number, prevRow?: FacilRow | null): string {
  const data = buildFacilNarrativeData(row, hari, prevRow);

  return `Anda adalah asisten analis untuk program revitalisasi sekolah. Tolong tulis analisis naratif untuk SATU fasilitator lapangan, PERSIS meniru gaya, struktur, dan urutan paragraf dari "CONTOH REFERENSI" di bawah - tapi SELURUH angka harus berasal dari "DATA FASILITATOR" (JSON) di bawahnya, JANGAN sekali-kali memakai angka dari contoh referensi.

=== CONTOH REFERENSI (tiru gaya & strukturnya, BUKAN angkanya) ===
${FACIL_NARRATIVE_REFERENCE_EXAMPLE}
=== AKHIR CONTOH REFERENSI ===

ATURAN WAJIB:
${FACIL_NARRATIVE_INSTRUCTIONS}

=== DATA FASILITATOR (SATU-SATUNYA sumber angka yang boleh dipakai) ===
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

${buildKnowledgeSummary(hari)}`;
}
