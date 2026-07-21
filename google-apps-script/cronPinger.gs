/**
 * =====================================================================
 * SCRIPT PENGGANTI VERCEL CRON (GRATIS TANPA BATAS)
 * =====================================================================
 * Karena Vercel Hobby melarang Cron Job lebih dari 1x sehari,
 * kita gunakan Google Apps Script sebagai "mesin pengetuk pintu".
 * 
 * Script ini berfungsi HANYA untuk mengetuk pintu Vercel (Next.js), 
 * lalu Next.js yang akan melakukan sisa pekerjaan beratnya.
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
  // GANTI INI DENGAN DOMAIN VERCEL-MU YANG AKTIF
  var NEXTJS_CRON_URL = "https://uwu-project.vercel.app/api/cron/sync-logs";
  
  // GANTI DENGAN CRON_SECRET YANG ADA DI VERCEL ENVIRONMENT VARIABLES (.env.local)
  var CRON_SECRET = "RahasiaVercelCron123!";
  
  var options = {
    method: "get",
    headers: {
      "Authorization": "Bearer " + CRON_SECRET
    },
    muteHttpExceptions: true // Biar script ga error kalau Vercel balas pesannya gagal
  };
  
  try {
    var response = UrlFetchApp.fetch(NEXTJS_CRON_URL, options);
    Logger.log("Status: " + response.getResponseCode());
    Logger.log("Response: " + response.getContentText());
  } catch (e) {
    Logger.log("Gagal menembak Vercel: " + e.message);
  }
}
