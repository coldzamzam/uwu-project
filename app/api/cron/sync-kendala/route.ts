import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getRosterEntries, extractSpreadsheetId, gvizCsvUrl } from "@/lib/masterSheet";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Maksimal 60 detik (cukup untuk concurrent CSV fetch)

const CONFIG = {
  FASIL_SHEET_NAME: "Isi Disini",
  FASIL_DATA_START_ROW_INDEX: 4, // baris 5 di Spreadsheet = index 4 di array 0-indexed
  MIN_HARI_KE: 1,
  MAX_HARI_KE: 14,
  PROGRAM_START_DATE: "2026-07-06",
  KOMUNIKASI_MIN_HARI: 2,
  MUNDUR_YES_VALUES: ["ya"],
  IGNORE_VALUES: ["tidak ada", "tidak ada kendala", "tidak ada masalah", "-", "n/a", "nihil", ""],
  RESOLVED_STATUS_VALUES: ["sesuai", "sudah sesuai", "sudah unggah berkas semua", "memiliki"],
};

function letterToIndex(letter: string): number {
  let column = 0;
  for (let i = 0; i < letter.length; i++) {
    column = column * 26 + (letter.charCodeAt(i) - 64);
  }
  return column - 1;
}

const MASTER_COLUMN_MAP = [
  { label: "Kendala Komunikasi", sourceCol: "H", statusChecks: [{ col: "G" }] },
  { label: "Kendala Memiliki Panlak/Format/Template Dokumen", sourceCol: "P", statusChecks: [{ col: "N" }, { col: "O" }] },
  { label: "Kendala Mendapatkan Perencana", sourceCol: "R", statusChecks: [{ col: "Q" }] },
  { label: "Kendala Verifikasi Biodata oleh Fasilitator", sourceCol: "X", statusChecks: [{ col: "W" }] },
  { label: "Kendala Update Dapodik", sourceCol: "Z", statusChecks: [{ col: "Y" }] },
  { label: "Kendala Penyusunan Dokumen Admin", sourceCol: "AD", statusChecks: [{ col: "AC" }] },
  { label: "Kendala Verifikasi Dokumen Admin oleh Fasilitator", sourceCol: "AM", statusChecks: [{ col: "AL" }] },
  { label: "Kendala Penyusunan Dokumen Teknis", sourceCol: "AF", statusChecks: [{ col: "AE" }] },
  { label: "Kendala Verifikasi Dokumen Teknis oleh Fasilitator", sourceCol: "AO", statusChecks: [{ col: "AN" }] },
  { label: "Kendala Penyepakatan RAB", sourceCol: "AQ", statusChecks: [{ col: "AP" }] },
];

function isIgnoredValue(val: string): boolean {
  const normalized = val.toLowerCase().trim().replace(/\s+/g, " ");
  return CONFIG.IGNORE_VALUES.includes(normalized);
}

function isResolvedStatus(val: string): boolean {
  const normalized = val.toLowerCase().trim().replace(/\s+/g, " ");
  return CONFIG.RESOLVED_STATUS_VALUES.includes(normalized);
}

function computeCurrentHari(): number {
  const parts = CONFIG.PROGRAM_START_DATE.split("-").map(Number);
  const startDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  let hari = diffDays + 1;
  if (hari < 1) hari = 1;
  if (hari > CONFIG.MAX_HARI_KE) hari = CONFIG.MAX_HARI_KE;
  return hari;
}

function parseHariNumber(val: any): number {
  if (typeof val === "number") return val;
  const match = String(val || "").match(/\d+/);
  return match ? parseInt(match[0], 10) : NaN;
}

export interface KendalaSyncRow {
  kodeFasil: string;
  namaFasil: string;
  totalSekolah: number;
  jumlahMundur: number;
  kendala: string[];
  skip: boolean;
  reason?: string;
}

export async function GET(request: Request) {
  try {
    // 1. Verifikasi Cron Secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const urlParams = new URL(request.url).searchParams;
    const offsetParam = urlParams.get("offset");
    const limitParam = urlParams.get("limit");

    // 2. Ambil Roster & chunking
    const fullRoster = await getRosterEntries();
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const limit = limitParam ? parseInt(limitParam, 10) : fullRoster.length;
    const roster = fullRoster.slice(offset, offset + limit);

    const payloadRows: KendalaSyncRow[] = Array(roster.length).fill(null);
    let successCount = 0;
    let skippedZeroCount = 0;
    let errorCount = 0;

    const currentHari = computeCurrentHari();

    // 3. Proses Paralel dengan sliding window max concurrent
    async function processWithConcurrency(items: typeof roster, maxConcurrent: number) {
      let index = 0;
      const promises: Promise<void>[] = [];

      const worker = async () => {
        while (index < items.length) {
          const currentIndex = index++;
          const entry = items[currentIndex];
          const targetUrl = entry.urlLKFasil || entry.urlLK;

          if (!targetUrl) {
            payloadRows[currentIndex] = {
              kodeFasil: entry.kodeFasil,
              namaFasil: entry.namaFasil,
              totalSekolah: 0,
              jumlahMundur: 0,
              kendala: Array(10).fill(""),
              skip: true,
              reason: "Tidak ada URL LK Fasil",
            };
            skippedZeroCount++;
            continue;
          }

          let attempt = 0;
          let success = false;

          while (attempt < 2 && !success) {
            attempt++;
            try {
              const sid = extractSpreadsheetId(targetUrl);
              if (!sid) throw new Error("ID Spreadsheet tidak valid");

              const url = gvizCsvUrl(sid, CONFIG.FASIL_SHEET_NAME) + `&t=${Date.now()}`;
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 7000);

              let res;
              try {
                res = await fetch(url, { cache: "no-store", signal: controller.signal });
              } finally {
                clearTimeout(timeoutId);
              }

              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const csv = await res.text();
              const parsed = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: false });

              if (!parsed.data || parsed.data.length <= CONFIG.FASIL_DATA_START_ROW_INDEX) {
                payloadRows[currentIndex] = {
                  kodeFasil: entry.kodeFasil,
                  namaFasil: entry.namaFasil,
                  totalSekolah: 0,
                  jumlahMundur: 0,
                  kendala: Array(10).fill(""),
                  skip: true,
                  reason: "Baris data kosong atau terlalu sedikit",
                };
                skippedZeroCount++;
                success = true;
                break;
              }

              const dataRows = parsed.data.slice(CONFIG.FASIL_DATA_START_ROW_INDEX);
              const colHariIdx = 1; // Kolom B
              const colNpsnIdx = 2; // Kolom C
              const colKomunikasiIdx = letterToIndex("G");
              const colMundurIdx = letterToIndex("L");

              // Forward fill untuk merged NPSN di kolom C
              let lastSeenNpsn = "";
              const allSchools = new Set<string>();
              const touchHistory: Record<string, Record<string, { hariNum: number; val: string }[]>> = {};
              MASTER_COLUMN_MAP.forEach((m) => (touchHistory[m.label] = {}));

              const mundurHistory: Record<string, { hariNum: number; val: string }> = {};
              let lastFilledHariKomunikasi: number | null = null;

              for (const row of dataRows) {
                if (!row) continue;
                const hariNum = parseHariNumber(row[colHariIdx]);
                if (isNaN(hariNum) || hariNum < CONFIG.MIN_HARI_KE || hariNum > CONFIG.MAX_HARI_KE) {
                  // Jika bukan baris hari yang valid, lewati (jangan override lastSeenNpsn jika kosong)
                  if ((row[colNpsnIdx] || "").trim()) {
                    lastSeenNpsn = (row[colNpsnIdx] || "").trim();
                  }
                  continue;
                }

                let npsn = (row[colNpsnIdx] || "").trim();
                if (!npsn && lastSeenNpsn) {
                  npsn = lastSeenNpsn; // forward-fill dari sel merge di atasnya
                } else if (npsn) {
                  lastSeenNpsn = npsn;
                }

                if (!npsn) continue;
                allSchools.add(npsn);

                // Cek pengisian status komunikasi (kolom G)
                const komVal = (row[colKomunikasiIdx] || "").trim();
                if (komVal !== "" && (lastFilledHariKomunikasi === null || hariNum > lastFilledHariKomunikasi)) {
                  lastFilledHariKomunikasi = hariNum;
                }

                // Catat status undur diri terbaru (kolom L)
                const mundurVal = (row[colMundurIdx] || "").trim();
                if (mundurVal !== "") {
                  const exist = mundurHistory[npsn];
                  if (!exist || hariNum >= exist.hariNum) {
                    mundurHistory[npsn] = { hariNum, val: mundurVal };
                  }
                }

                // Catat status kendala
                MASTER_COLUMN_MAP.forEach((m) => {
                  const srcIdx = letterToIndex(m.sourceCol);
                  const val = (row[srcIdx] || "").trim();

                  const isResolved = m.statusChecks.some((chk) => {
                    const chkIdx = letterToIndex(chk.col);
                    const chkVal = (row[chkIdx] || "").trim();
                    return chkVal !== "" && isResolvedStatus(chkVal);
                  });

                  if (!touchHistory[m.label][npsn]) touchHistory[m.label][npsn] = [];

                  if (isResolved) {
                    touchHistory[m.label][npsn].push({ hariNum, val: "" });
                  } else if (val !== "") {
                    touchHistory[m.label][npsn].push({ hariNum, val });
                  }
                });
              }

              const totalSekolah = allSchools.size;

              // GUARD: Jika total Sekolah 0 atau null, lewati penulisan ke master data!
              if (!totalSekolah || totalSekolah <= 0) {
                payloadRows[currentIndex] = {
                  kodeFasil: entry.kodeFasil,
                  namaFasil: entry.namaFasil,
                  totalSekolah: 0,
                  jumlahMundur: 0,
                  kendala: Array(10).fill(""),
                  skip: true,
                  reason: "Total sekolah dihitung = 0 atau null (dilewati dari penulisan)",
                };
                skippedZeroCount++;
                success = true;
                break;
              }

              // Hitung jumlah sekolah mengundurkan diri (status terakhir = Ya)
              let jumlahMundur = 0;
              Object.values(mundurHistory).forEach((h) => {
                if (CONFIG.MUNDUR_YES_VALUES.includes(h.val.toLowerCase().trim())) {
                  jumlahMundur++;
                }
              });

              // Rangkai kesimpulan kendala per kolom
              const kendalaArray: string[] = [];
              const activeValuesMap: Record<string, string> = {};

              MASTER_COLUMN_MAP.forEach((m) => {
                const schoolNpsns = Object.keys(touchHistory[m.label]);
                const issues: string[] = [];
                schoolNpsns.forEach((npsn) => {
                  const events = touchHistory[m.label][npsn];
                  events.sort((a, b) => a.hariNum - b.hariNum);
                  const latest = events[events.length - 1];
                  if (latest && latest.val && !isIgnoredValue(latest.val)) {
                    issues.push(latest.val);
                  }
                });
                const summary = Array.from(new Set(issues)).join(", ");
                activeValuesMap[m.label] = summary;
              });

              // Tambahan progres komunikasi di Kendala Komunikasi jika hari >= 2
              if (currentHari >= CONFIG.KOMUNIKASI_MIN_HARI) {
                let catatanProgress: string | null = null;
                if (lastFilledHariKomunikasi === null) {
                  catatanProgress = "Belum pernah mengisi status komunikasi sama sekali";
                } else if (lastFilledHariKomunikasi < currentHari) {
                  catatanProgress = `Baru mengisi sampai Hari ke-${lastFilledHariKomunikasi} (harusnya sudah Hari ke-${currentHari})`;
                }

                if (catatanProgress) {
                  const existing = activeValuesMap["Kendala Komunikasi"];
                  activeValuesMap["Kendala Komunikasi"] = existing ? `${existing}, ${catatanProgress}` : catatanProgress;
                }
              }

              MASTER_COLUMN_MAP.forEach((m) => {
                kendalaArray.push(activeValuesMap[m.label] || "");
              });

              payloadRows[currentIndex] = {
                kodeFasil: entry.kodeFasil,
                namaFasil: entry.namaFasil,
                totalSekolah,
                jumlahMundur,
                kendala: kendalaArray,
                skip: false,
              };
              successCount++;
              success = true;
            } catch (err: any) {
              if (attempt === 2) {
                errorCount++;
                payloadRows[currentIndex] = {
                  kodeFasil: entry.kodeFasil,
                  namaFasil: entry.namaFasil,
                  totalSekolah: 0,
                  jumlahMundur: 0,
                  kendala: Array(10).fill(""),
                  skip: true,
                  reason: `Error fetch 2x: ${err?.message || err}`,
                };
              } else {
                await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
              }
            }
          }
        }
      };

      for (let i = 0; i < maxConcurrent; i++) {
        promises.push(worker());
      }
      await Promise.all(promises);
    }

    await processWithConcurrency(roster, 20);

    // Jika dipanggil via chunking oleh pinger GAS, kembalikan respons langsung
    if (offsetParam || limitParam) {
      return NextResponse.json({
        status: "success",
        type: "kendala",
        offset,
        limit,
        berhasilTarik: successCount,
        skippedZeroOrEmpty: skippedZeroCount,
        errorCount,
        rows: payloadRows,
      });
    }

    // Fallback Webhook jika dipanggil sekaligus (tanpa chunk)
    const webhookUrl = process.env.SYNC_WEBHOOK_URL;
    const webhookSecret = process.env.SYNC_SECRET_KEY;

    if (!webhookUrl || !webhookSecret) {
      return NextResponse.json({
        status: "success",
        message: "Selesai tarik kendala, namun SYNC_WEBHOOK_URL atau SYNC_SECRET_KEY belum diatur di .env",
        rows: payloadRows,
      });
    }

    const whRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: webhookSecret,
        type: "kendala",
        rows: payloadRows.filter((r) => !r.skip),
      }),
    });

    const whData = await whRes.json();
    return NextResponse.json({
      status: "success",
      type: "kendala",
      berhasilTarik: successCount,
      skippedZeroOrEmpty: skippedZeroCount,
      webhookResponse: whData,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
