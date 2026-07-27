/**
 * =====================================================================
 * SCRIPT PINGER GABUNGAN (PENGGANTI VERCEL CRON - GRATIS TANPA BATAS)
 * =====================================================================
 * Script ini bertugas sebagai "mesin pengetuk pintu" Vercel secara bergilir
 * setiap 5 menit untuk menarik DUA jenis data sekaligus:
 * 1. Data Log Hari & Skor Akhir (/api/cron/sync-logs) - chunk 75 fasil
 * 2. Data Kendala Kualitatif & Total Sekolah (/api/cron/sync-kendala) - chunk 25 fasil (lebih ringan agar bebas timeout)
 * =====================================================================
 */

function panggilVercelCron() {
  var BASE_URL = "https://uwu-project.vercel.app";
  var CRON_SECRET = "RahasiaVercelCron123!";
  
  var WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxLZq5DyJ01HJFv9Sv1SW7Rl6JEq9xTo93-7-eD5s4qG7qgByfebl-JY-D7ZXmrMT1o/exec";
  var WEBHOOK_SECRET = "UwU_Rahasia_123!";
  
  var totalFasilitator = 390;
  var anyDataUpdated = false;
  
  // =====================================================================
  // TAHAP 1: SINKRONISASI LOG (sync-logs) - Chunk Size 75
  // =====================================================================
  Logger.log("==================================================");
  Logger.log("MEMULAI TAHAP 1: SINKRONISASI LOG HARI");
  Logger.log("==================================================");
  
  var chunkSizeLog = 75;
  var allLogRows = [];
  var hariKe = 0;
  var logNumber = 0;
  var skipLogs = false;
  
  for (var offset = 0; offset < totalFasilitator; offset += chunkSizeLog) {
    var fetchUrlLog = BASE_URL + "/api/cron/sync-logs?offset=" + offset + "&limit=" + chunkSizeLog;
    var options = {
      method: "get",
      headers: { "Authorization": "Bearer " + CRON_SECRET },
      muteHttpExceptions: true
    };
    
    try {
      Logger.log("[Logs] Mengambil chunk offset " + offset + "...");
      var responseLog = UrlFetchApp.fetch(fetchUrlLog, options);
      var codeLog = responseLog.getResponseCode();
      var contentLog = responseLog.getContentText();
      
      if (codeLog !== 200) {
        Logger.log("[Logs] HTTP Error " + codeLog + " di offset " + offset + ": " + contentLog.substring(0, 100));
        continue;
      }

      var jsonLog;
      try {
        jsonLog = JSON.parse(contentLog);
      } catch (errJson) {
        Logger.log("[Logs] Gagal parse JSON di offset " + offset + ": " + contentLog.substring(0, 100));
        continue;
      }
      
      if (jsonLog.status === "skip") {
        Logger.log("[Logs] Skip dari server: " + jsonLog.message);
        skipLogs = true;
        break;
      }
      
      if (jsonLog.rows) {
        allLogRows = allLogRows.concat(jsonLog.rows);
        hariKe = jsonLog.hariKe;
        logNumber = jsonLog.logNumber;
      }
    } catch (e) {
      Logger.log("[Logs] Error fetch Vercel chunk " + offset + ": " + e.message);
    }
  }
  
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
  // TAHAP 2: SINKRONISASI KENDALA & TOTAL SEKOLAH (sync-kendala) - Chunk Size 25
  // =====================================================================
  Logger.log("==================================================");
  Logger.log("MEMULAI TAHAP 2: SINKRONISASI KENDALA & TOTAL SEKOLAH");
  Logger.log("==================================================");
  
  // Gunakan chunkSize 25 untuk kendala karena membaca tab "Isi Disini" jauh lebih besar daripada tab "Log"
  var chunkSizeKendala = 25;
  var allKendalaRows = [];
  
  for (var offsetK = 0; offsetK < totalFasilitator; offsetK += chunkSizeKendala) {
    var fetchUrlKendala = BASE_URL + "/api/cron/sync-kendala?offset=" + offsetK + "&limit=" + chunkSizeKendala;
    var optionsK = {
      method: "get",
      headers: { "Authorization": "Bearer " + CRON_SECRET },
      muteHttpExceptions: true
    };
    
    try {
      Logger.log("[Kendala] Mengambil chunk offset " + offsetK + " (limit " + chunkSizeKendala + ")...");
      var responseKendala = UrlFetchApp.fetch(fetchUrlKendala, optionsK);
      var codeKendala = responseKendala.getResponseCode();
      var contentKendala = responseKendala.getContentText();
      
      if (codeKendala !== 200) {
        Logger.log("[Kendala] HTTP Error " + codeKendala + " di offset " + offsetK + ": " + contentKendala.substring(0, 100));
        continue;
      }

      var jsonKendala;
      try {
        jsonKendala = JSON.parse(contentKendala);
      } catch (errJsonK) {
        Logger.log("[Kendala] Respons bukan JSON valid (kemungkinan Vercel Timeout) di offset " + offsetK + ": " + contentKendala.substring(0, 100));
        continue;
      }
      
      if (jsonKendala.rows) {
        // Hanya kumpulkan baris yang TIDAK di-skip (totalSekolah > 0 dan valid)
        var validRows = jsonKendala.rows.filter(function(r) { return r && !r.skip; });
        allKendalaRows = allKendalaRows.concat(validRows);
      }
    } catch (e) {
      Logger.log("[Kendala] Error fetch Vercel chunk " + offsetK + ": " + e.message);
    }
  }
  
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
