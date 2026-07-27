/**
 * =====================================================================
 * SCRIPT PINGER GABUNGAN (PENGGANTI VERCEL CRON - GRATIS & KILAT)
 * =====================================================================
 * Fitur Unggulan Terbaru:
 * 1. Mencegah Tabrakan (LockService): Jika pinger masih berjalan dari jadwal
 *    sebelumnya, jadwal baru otomatis batal (tidak akan berebutan/double eksekusi).
 * 2. Eksekusi Paralel Serentak (UrlFetchApp.fetchAll): Memerintahkan Vercel 
 *    mengekstrak seluruh chunk secara BARSAMAAN dalam hitungan detik (bukan berurutan),
 *    memangkas total durasi Apps Script dari >5 menit menjadi hanya ~15-25 detik!
 * =====================================================================
 */

function panggilVercelCron() {
  // 1. SISTEM PENGAMAN (LOCK SERVICE)agar tidak terjadi eksekusi ganda jika jadwal bertumpuk
  var lock = LockService.getScriptLock();
  // Coba dapatkan kunci eksekusi maksimal selama 10 detik
  if (!lock.tryLock(10000)) {
    Logger.log("⚠️ PERINGATAN: Eksekusi pinger sebelumnya masih aktif/belum selesai! Siklus ini ditiadakan demi mencegah tabrakan data.");
    return;
  }
  
  try {
    var BASE_URL = "https://uwu-project.vercel.app";
    var CRON_SECRET = "RahasiaVercelCron123!";
    
    var WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxLZq5DyJ01HJFv9Sv1SW7Rl6JEq9xTo93-7-eD5s4qG7qgByfebl-JY-D7ZXmrMT1o/exec";
    var WEBHOOK_SECRET = "UwU_Rahasia_123!";
    
    var totalFasilitator = 390;
    var anyDataUpdated = false;
    
    var authHeader = { "Authorization": "Bearer " + CRON_SECRET };
    
    // =====================================================================
    // TAHAP 1: SINKRONISASI LOG HARI (PARALEL - chunk 65)
    // =====================================================================
    Logger.log("==================================================");
    Logger.log("MEMULAI TAHAP 1: SINKRONISASI LOG (PARALEL SERENTAK)");
    Logger.log("==================================================");
    
    var chunkSizeLog = 65;
    var logRequests = [];
    
    for (var offsetLog = 0; offsetLog < totalFasilitator; offsetLog += chunkSizeLog) {
      logRequests.push({
        url: BASE_URL + "/api/cron/sync-logs?offset=" + offsetLog + "&limit=" + chunkSizeLog,
        method: "get",
        headers: authHeader,
        muteHttpExceptions: true
      });
    }
    
    var allLogRows = [];
    var hariKe = 0;
    var logNumber = 0;
    var skipLogs = false;
    
    Logger.log("[Logs] Mengirim " + logRequests.length + " panggilan paralel serentak ke Vercel...");
    var logResponses = UrlFetchApp.fetchAll(logRequests);
    Logger.log("[Logs] Semua respons chunk diterimadan siap dibedah!");
    
    for (var i = 0; i < logResponses.length; i++) {
      var res = logResponses[i];
      if (res.getResponseCode() !== 200) continue;
      
      try {
        var jsonLog = JSON.parse(res.getContentText());
        if (jsonLog.status === "skip") {
          Logger.log("[Logs] Info skip: " + jsonLog.message);
          skipLogs = true;
          break;
        }
        if (jsonLog.rows && jsonLog.rows.length > 0) {
          allLogRows = allLogRows.concat(jsonLog.rows);
          if (!hariKe) hariKe = jsonLog.hariKe;
          if (!logNumber) logNumber = jsonLog.logNumber;
        }
      } catch (err) {
        Logger.log("[Logs] Error parse chunk " + i + ": " + err.message);
      }
    }
    
    if (!skipLogs && allLogRows.length > 0 && hariKe && logNumber) {
      Logger.log("[Logs] Mengirim total " + allLogRows.length + " baris log ke Webhook...");
      var whLogResponse = UrlFetchApp.fetch(WEBHOOK_URL, {
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
      });
      Logger.log("[Logs] Respons Webhook: " + whLogResponse.getContentText());
      anyDataUpdated = true;
    }
    
    // =====================================================================
    // TAHAP 2: SINKRONISASI KENDALA & TOTAL SEKOLAH (PARALEL - chunk 40)
    // =====================================================================
    Logger.log("==================================================");
    Logger.log("MEMULAI TAHAP 2: SINKRONISASI KENDALA (PARALEL SERENTAK)");
    Logger.log("==================================================");
    
    var chunkSizeKendala = 40;
    var kendalaRequests = [];
    
    for (var offsetK = 0; offsetK < totalFasilitator; offsetK += chunkSizeKendala) {
      kendalaRequests.push({
        url: BASE_URL + "/api/cron/sync-kendala?offset=" + offsetK + "&limit=" + chunkSizeKendala,
        method: "get",
        headers: authHeader,
        muteHttpExceptions: true
      });
    }
    
    var allKendalaRows = [];
    Logger.log("[Kendala] Mengirim " + kendalaRequests.length + " panggilan paralel serentak ke Vercel...");
    var kendalaResponses = UrlFetchApp.fetchAll(kendalaRequests);
    Logger.log("[Kendala] Seluruh chunk berhasil dieksekusi secara bersamaan!");
    
    for (var k = 0; k < kendalaResponses.length; k++) {
      var resK = kendalaResponses[k];
      if (resK.getResponseCode() !== 200) continue;
      
      try {
        var jsonK = JSON.parse(resK.getContentText());
        if (jsonK.rows && jsonK.rows.length > 0) {
          // Pilih hanya baris yang VALID (tanpa totalSekolah 0 / null)
          var validRows = jsonK.rows.filter(function(r) { return r && !r.skip; });
          allKendalaRows = allKendalaRows.concat(validRows);
        }
      } catch (errK) {
        Logger.log("[Kendala] Error parse chunk " + k + ": " + errK.message);
      }
    }
    
    if (allKendalaRows.length > 0) {
      Logger.log("[Kendala] Mengirim total " + allKendalaRows.length + " baris valid ke Webhook...");
      var whKendalaResponse = UrlFetchApp.fetch(WEBHOOK_URL, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          secret: WEBHOOK_SECRET,
          type: "kendala",
          rows: allKendalaRows
        }),
        muteHttpExceptions: true
      });
      Logger.log("[Kendala] Respons Webhook: " + whKendalaResponse.getContentText());
      anyDataUpdated = true;
    } else {
      Logger.log("[Kendala] Tidak ada baris kendala baru yang valid pada putaran ini.");
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
  } finally {
    // Selalu lepaskan kunci di akhir agar siklus berikutnya dapat berlaga
    lock.releaseLock();
  }
}
