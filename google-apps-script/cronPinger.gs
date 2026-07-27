/**
 * =====================================================================
 * SCRIPT PINGER GABUNGAN (PENGGANTI VERCEL CRON - GRATIS TANPA BATAS)
 * =====================================================================
 * Script ini bertugas sebagai "mesin pengetuk pintu" Vercel secara bergilir
 * setiap 5 menit untuk menarik DUA jenis data sekaligus:
 * 1. Data Log Hari & Skor Akhir (/api/cron/sync-logs)
 * 2. Data Kendala Kualitatif & Total Sekolah (/api/cron/sync-kendala)
 *
 * CARA PAKAI:
 * 1. Taruh file ini di Google Apps Script (misal: cronPinger.gs)
 * 2. Masuk ke menu Pemicu (Triggers) logo jam alarm di kiri.
 * 3. Buat pemicu baru:
 *    - Fungsi: panggilVercelCron
 *    - Sumber acara: Berdasarkan waktu (Time-driven)
 *    - Tipe: Menit (Minutes timer)
 *    - Interval: Setiap 5 menit (Every 5 minutes)
 * 4. Simpan. Selesai!
 * =====================================================================
 */

function panggilVercelCron() {
  // BASE DOMAIN VERCEL
  var BASE_URL = "https://uwu-project.vercel.app";
  var CRON_SECRET = "RahasiaVercelCron123!";
  
  // WEBHOOK SYNC RECEIVER (dari deployment Apps Script Receiver Anda)
  var WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxLZq5DyJ01HJFv9Sv1SW7Rl6JEq9xTo93-7-eD5s4qG7qgByfebl-JY-D7ZXmrMT1o/exec";
  var WEBHOOK_SECRET = "UwU_Rahasia_123!";
  
  var totalFasilitator = 390;
  var chunkSize = 75; // Ambil 75 fasil per panggilan (menghindari timeout Vercel)
  var anyDataUpdated = false;
  
  // =====================================================================
  // TAHAP 1: SINKRONISASI LOG (sync-logs)
  // =====================================================================
  Logger.log("==================================================");
  Logger.log("MEMULAI TAHAP 1: SINKRONISASI LOG HARI");
  Logger.log("==================================================");
  
  var allLogRows = [];
  var hariKe = 0;
  var logNumber = 0;
  var totalBerhasilLog = 0;
  var skipLogs = false;
  
  for (var offset = 0; offset < totalFasilitator; offset += chunkSize) {
    var fetchUrlLog = BASE_URL + "/api/cron/sync-logs?offset=" + offset + "&limit=" + chunkSize;
    var options = {
      method: "get",
      headers: { "Authorization": "Bearer " + CRON_SECRET },
      muteHttpExceptions: true
    };
    
    try {
      Logger.log("[Logs] Mengambil chunk offset " + offset + "...");
      var responseLog = UrlFetchApp.fetch(fetchUrlLog, options);
      var codeLog = responseLog.getResponseCode();
      var jsonLog = JSON.parse(responseLog.getContentText());
      
      if (codeLog === 200 && jsonLog.rows) {
        allLogRows = allLogRows.concat(jsonLog.rows);
        hariKe = jsonLog.hariKe;
        logNumber = jsonLog.logNumber;
        totalBerhasilLog += jsonLog.berhasilTarik || 0;
      } else {
        Logger.log("[Logs] Skip/Info: " + responseLog.getContentText());
        if (jsonLog.status === "skip") {
          skipLogs = true;
          break;
        }
      }
    } catch (e) {
      Logger.log("[Logs] Error fetch Vercel chunk " + offset + ": " + e.message);
    }
  }
  
  // Kirim hasil logs ke Webhook jika ada
  if (!skipLogs && allLogRows.length > 0 && hariKe && logNumber) {
    Logger.log("[Logs] Berhasil mengumpulkan " + allLogRows.length + " baris. Mengirim ke Webhook...");
    var whLogOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        secret: WEBHOOK_SECRET,
        type: "logs",
        hariKe: hariKe,
        logNumber: logNumber,
        rows: allLogRows
      }),
      muteHttpExceptions: true
    };
    
    try {
      var whLogResponse = UrlFetchApp.fetch(WEBHOOK_URL, whLogOptions);
      Logger.log("[Logs] Webhook response: " + whLogResponse.getContentText());
      anyDataUpdated = true;
    } catch (e) {
      Logger.log("[Logs] Error kirim webhook: " + e.message);
    }
  }
  
  // =====================================================================
  // TAHAP 2: SINKRONISASI KENDALA & TOTAL SEKOLAH (sync-kendala)
  // =====================================================================
  Logger.log("==================================================");
  Logger.log("MEMULAI TAHAP 2: SINKRONISASI KENDALA & TOTAL SEKOLAH");
  Logger.log("==================================================");
  
  var allKendalaRows = [];
  var totalBerhasilKendala = 0;
  
  for (var offsetK = 0; offsetK < totalFasilitator; offsetK += chunkSize) {
    var fetchUrlKendala = BASE_URL + "/api/cron/sync-kendala?offset=" + offsetK + "&limit=" + chunkSize;
    var optionsK = {
      method: "get",
      headers: { "Authorization": "Bearer " + CRON_SECRET },
      muteHttpExceptions: true
    };
    
    try {
      Logger.log("[Kendala] Mengambil chunk offset " + offsetK + "...");
      var responseKendala = UrlFetchApp.fetch(fetchUrlKendala, optionsK);
      var codeKendala = responseKendala.getResponseCode();
      var jsonKendala = JSON.parse(responseKendala.getContentText());
      
      if (codeKendala === 200 && jsonKendala.rows) {
        // Hanya kumpulkan baris yang TIDAK di-skip (totalSekolah > 0)
        var validRows = jsonKendala.rows.filter(function(r) { return r && !r.skip; });
        allKendalaRows = allKendalaRows.concat(validRows);
        totalBerhasilKendala += jsonKendala.berhasilTarik || 0;
      } else {
        Logger.log("[Kendala] Skip/Error: " + responseKendala.getContentText());
      }
    } catch (e) {
      Logger.log("[Kendala] Error fetch Vercel chunk " + offsetK + ": " + e.message);
    }
  }
  
  // Kirim hasil kendala ke Webhook jika ada baris valid
  if (allKendalaRows.length > 0) {
    Logger.log("[Kendala] Berhasil mengumpulkan " + allKendalaRows.length + " baris valid (tanpa 0/null). Mengirim ke Webhook...");
    var whKendalaOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        secret: WEBHOOK_SECRET,
        type: "kendala",
        rows: allKendalaRows
      }),
      muteHttpExceptions: true
    };
    
    try {
      var whKendalaResponse = UrlFetchApp.fetch(WEBHOOK_URL, whKendalaOptions);
      Logger.log("[Kendala] Webhook response: " + whKendalaResponse.getContentText());
      anyDataUpdated = true;
    } catch (e) {
      Logger.log("[Kendala] Error kirim webhook: " + e.message);
    }
  } else {
    Logger.log("[Kendala] Tidak ada baris kendala baru / valid di putaran ini.");
  }

  // =====================================================================
  // TAHAP 3: REVALIDATE CACHE NEXT.JS
  // =====================================================================
  if (anyDataUpdated) {
    try {
      Logger.log("MENGHANCURKAN CACHE VERCEL...");
      var revalResponse = UrlFetchApp.fetch(BASE_URL + "/api/revalidate", { muteHttpExceptions: true });
      Logger.log("Vercel Cache Revalidate: " + revalResponse.getContentText());
    } catch (e) {
      Logger.log("Error revalidate: " + e.message);
    }
  }
}
