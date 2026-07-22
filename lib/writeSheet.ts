import { revalidateTag } from "next/cache";
import { getControllerEntry } from "./controller";

/** Tag cache Next.js buat isi tabel log (tab "Analisis" dkk) SATU
 * spreadsheet LK Log pribadi fasilitator - dipakai supaya cache 20 detik di
 * findLogTable() BISA di-invalidate paksa begitu ada tulisan baru
 * (pushAnalysisToSheet), tanpa harus nunggu TTL habis ATAU korbankan
 * kecepatan baca yang tidak terkait tulisan (baca fasilitator lain, atau
 * baca yang sama tapi >20 detik sebelum tulisan terakhir). */
function analisisCacheTag(spreadsheetId: string): string {
  return `analisis-sheet-${spreadsheetId}`;
}

export interface AnalysisSaveItem {
  kodeFasil: string;
  hari: number;
  hasil: string;
}

export interface WriteSheetResult {
  ok: boolean;
  updated?: number;
  notFound?: string[];
  error?: string;
}

function normalize(v: any) {
  return String(v == null ? "" : v).trim();
}

/** 
 * Cari tabel log harian di seluruh sheet.
 * Karena kita pakai REST API, kita ambil metadata sheet dulu lalu ambil valuesnya.
 */
/** Helper: coba fetch satu tab dan cari header "Analisis" + "Hari Ke". */
async function tryFetchTab(spreadsheetId: string, sheetName: string, accessToken: string) {
  try {
    const range = encodeURIComponent(`${sheetName}!A1:Z500`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        next: { revalidate: 20, tags: [analisisCacheTag(spreadsheetId)] },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const values = data.values || [];

    for (let r = 0; r < values.length; r++) {
      let analisisCol = -1;
      let hariCol = -1;
      for (let c = 0; c < values[r].length; c++) {
        const cell = normalize(values[r][c]);
        if (cell === "Analisis") analisisCol = c;
        if (cell.startsWith("Hari Ke")) hariCol = c;
      }
      if (analisisCol !== -1 && hariCol !== -1) {
        return { sheetName, headerRow: r, hariCol, analisisCol, values };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function findLogTable(spreadsheetId: string, accessToken: string) {
  // === FASE 1: Tebak langsung tab "Log" dan "Isian" secara PARALEL ===
  // Skip metadata fetch sama sekali — ini menghemat ~400ms latensi di
  // Vercel karena tidak perlu round-trip ekstra ke Sheets API. Hampir
  // seluruh fasilitator memakai nama tab standar, jadi ini hampir selalu
  // berhasil di percobaan pertama.
  const KNOWN_TABS = ["Log", "Isian"];
  const knownResults = await Promise.all(
    KNOWN_TABS.map((name) => tryFetchTab(spreadsheetId, name, accessToken))
  );
  const knownHit = knownResults.find((r) => r !== null);
  if (knownHit) return knownHit;

  // === FASE 2: Fallback — ambil metadata lalu cari di tab lain ===
  // Hanya terjadi jika tab bukan "Log"/"Isian" (sangat jarang).
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 60 },
    }
  );
  if (!metaRes.ok) {
    const detail = await metaRes.text().catch(() => "");
    let detailMsg = detail;
    try {
      detailMsg = JSON.parse(detail)?.error?.message ?? detail;
    } catch {
      // biarkan detailMsg = raw text kalau bukan JSON
    }
    throw new Error(`Gagal akses spreadsheet (HTTP ${metaRes.status}): ${detailMsg}`);
  }
  const metaData = await metaRes.json();
  const allSheets: string[] = metaData.sheets?.map((s: any) => s.properties.title) || [];

  // Cari tab yang mengandung kata "log" (case-insensitive), kecuali yang
  // sudah dicoba di Fase 1.
  const remaining = allSheets.filter(
    (s) => !KNOWN_TABS.includes(s) && s.toLowerCase().includes("log")
  );
  // Kalau tidak ada kandidat "log"-like, coba SEMUA tab yang tersisa.
  const toTry = remaining.length > 0 ? remaining : allSheets.filter((s) => !KNOWN_TABS.includes(s));

  // Coba semua kandidat secara PARALEL (bukan sequential).
  const fallbackResults = await Promise.all(
    toTry.map((name) => tryFetchTab(spreadsheetId, name, accessToken))
  );
  return fallbackResults.find((r) => r !== null) ?? null;
}

/** Seluruh isi kolom "Analisis" (hari -> teksnya, string kosong kalau
 * kolomnya kosong) dari tabel log SATU fasilitator - satu fetch dipakai buat
 * prefill textarea hari yang lagi dilihat SEKALIGUS status "sudah/belum ada
 * analisis" per hari (mis. buat DaySelector), jangan fetch per-hari
 * berulang-ulang cuma buat baca kolom yang sama. */
export async function fetchAnalisisTable(kodeFasil: string, accessToken?: string): Promise<Map<number, string> | null> {
  if (!accessToken) return null;
  const entry = await getControllerEntry(kodeFasil);
  if (!entry) return null;

  try {
    const found = await findLogTable(entry.spreadsheetId, accessToken);
    if (!found) return null;

    const byHari = new Map<number, string>();
    for (let r = found.headerRow + 1; r < found.values.length; r++) {
      const rowHariRaw = normalize(found.values[r][found.hariCol]);
      const rowHari = parseInt(rowHariRaw, 10);
      if (isNaN(rowHari)) continue;
      byHari.set(rowHari, normalize(found.values[r][found.analisisCol]));
    }
    return byHari;
  } catch (err) {
    console.warn(`[writeSheet] fetchAnalisisTable error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Mengonversi nomor kolom 0-based jadi huruf (misal: 0 -> A, 25 -> Z, 26 -> AA) */
function colToLetter(col: number): string {
  let temp, letter = '';
  while (col >= 0) {
    temp = col % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp) / 26 - 1;
  }
  return letter;
}

export async function pushAnalysisToSheet(items: AnalysisSaveItem[], accessToken?: string): Promise<WriteSheetResult> {
  if (!accessToken) {
    return { ok: false, error: "Kamu belum memberikan izin akses Spreadsheet pada saat login. Silakan login ulang." };
  }

  // Kelompokkan per spreadsheet
  const bySpreadsheet: Record<string, AnalysisSaveItem[]> = {};
  const notFound: string[] = [];

  for (const item of items) {
    const entry = await getControllerEntry(item.kodeFasil);
    if (!entry) {
      notFound.push(`${item.kodeFasil} Hari ${item.hari} (fasilitator tidak ditemukan)`);
      continue;
    }
    const key = entry.spreadsheetId;
    if (!bySpreadsheet[key]) bySpreadsheet[key] = [];
    bySpreadsheet[key].push(item);
  }

  let updated = 0;

  for (const spreadsheetId of Object.keys(bySpreadsheet)) {
    const groupItems = bySpreadsheet[spreadsheetId];
    const label = groupItems[0].kodeFasil || spreadsheetId;

    let found;
    try {
      found = await findLogTable(spreadsheetId, accessToken);
    } catch (err) {
      // JANGAN buang detail errornya (mis. "HTTP 403" vs "HTTP 401") - beda
      // penyebab (token tidak valid vs akun tidak punya izin ke sheet ini)
      // butuh tindak lanjut yang beda juga.
      const detail = err instanceof Error ? err.message : String(err);
      groupItems.forEach((i) => notFound.push(`${label} Hari ${i.hari} (gagal akses sheet: ${detail})`));
      continue;
    }

    if (!found) {
      groupItems.forEach((i) => notFound.push(`${label} Hari ${i.hari} (tabel log tidak ketemu)`));
      continue;
    }

    // Persiapkan batchUpdate
    const updateData = [];
    for (const item of groupItems) {
      let rowFound = false;
      for (let r = found.headerRow + 1; r < found.values.length; r++) {
        const rowHariRaw = normalize(found.values[r][found.hariCol]);
        const rowHari = parseInt(rowHariRaw, 10);
        if (!isNaN(rowHari) && rowHari === item.hari) {
          const rowNumber = r + 1;
          const colLetter = colToLetter(found.analisisCol);
          const range = `${found.sheetName}!${colLetter}${rowNumber}`;
          updateData.push({ range, values: [[item.hasil]] });
          rowFound = true;
          updated++;
          break;
        }
      }
      if (!rowFound) {
        notFound.push(`${label} Hari ${item.hari} (baris hari ke-${item.hari} tidak ketemu)`);
      }
    }

    if (updateData.length > 0) {
      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updateData,
        }),
      });
      if (!updateRes.ok) {
        groupItems.forEach((i) => notFound.push(`${label} Hari ${i.hari} (gagal nulis nilai)`));
      } else {
        // Paksa cache 20 detik di findLogTable() basi SEKARANG (bukan nunggu
        // TTL) - pembacaan berikutnya (mis. pindah hari lalu balik lagi)
        // pasti dapat teks yang baru saja ditulis, bukan versi lama. Next.js
        // 16 mewajibkan argumen ke-2 (profile) - { expire: 0 } = "basi
        // sekarang juga", tidak terikat nama profile cacheLife tertentu.
        revalidateTag(analisisCacheTag(spreadsheetId), { expire: 0 });
      }
    }
  }

  return { ok: true, updated, notFound };
}
