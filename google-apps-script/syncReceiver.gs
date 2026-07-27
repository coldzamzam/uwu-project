const SECRET_KEY = "UwU_Rahasia_123!"; // Samakan dengan yang di Next.js nanti

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // 1. Verifikasi Keamanan
    if (payload.secret !== SECRET_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // =====================================================================
    // PERCABANGAN 1: PENAMPUNG DATA KENDALA & TOTAL SEKOLAH (sync-kendala)
    // =====================================================================
    if (payload.type === "kendala") {
      const rows = payload.rows;
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Tidak ada baris kendala untuk diproses" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // Cari tab master (bisa bernama "Daftar Fasilitator" atau "Fasilitator")
      const targetSheet = ss.getSheetByName("Daftar Fasilitator") || ss.getSheetByName("Fasilitator");
      if (!targetSheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Sheet Daftar Fasilitator / Fasilitator tidak ditemukan" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const lastRow = targetSheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Data fasilitator di master sheet kosong" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const numRows = lastRow - 1; // Mulai dari baris 2 (baris 1 header)
      
      // Ambil kolom A s.d. S (19 kolom) untuk pencocokan Kode Fasil (Kolom D) dan Nama Fasil (Kolom E)
      const allValues = targetSheet.getRange(2, 1, numRows, Math.max(targetSheet.getLastColumn(), 19)).getValues();
      
      // Blok yang akan di-update adalah Kolom H (Index 7) s.d. S (Index 18) = 12 kolom
      // [Total Sekolah, Jumlah Mundur, 10 Kolom Kendala]
      const updateBlock = targetSheet.getRange(2, 8, numRows, 12).getValues();

      // Buat pemetaan index baris berdasarkan Kode Fasil & Nama Fasil
      const rowMap = {};
      for (let i = 0; i < allValues.length; i++) {
        const kf = String(allValues[i][3] || "").trim(); // Kolom D (Index 3) = Kode Fasil
        const nf = String(allValues[i][4] || "").trim(); // Kolom E (Index 4) = Nama Fasil
        if (kf) rowMap[kf] = i;
        if (nf) rowMap[nf] = i;
      }

      let updatedCount = 0;
      let skippedCount = 0;

      for (let j = 0; j < rows.length; j++) {
        const item = rows[j];
        if (!item) continue;

        // GUARD: Jika skip === true, atau totalSekolah adalah 0 atau null, JANGAN update ke sheet master
        if (item.skip || !item.totalSekolah || Number(item.totalSekolah) <= 0) {
          skippedCount++;
          continue;
        }

        let targetIdx = -1;
        if (item.kodeFasil && rowMap[String(item.kodeFasil).trim()] !== undefined) {
          targetIdx = rowMap[String(item.kodeFasil).trim()];
        } else if (item.namaFasil && rowMap[String(item.namaFasil).trim()] !== undefined) {
          targetIdx = rowMap[String(item.namaFasil).trim()];
        }

        if (targetIdx !== -1) {
          updateBlock[targetIdx][0] = Number(item.totalSekolah);
          updateBlock[targetIdx][1] = Number(item.jumlahMundur || 0);
          const kArr = item.kendala || [];
          for (let k = 0; k < 10; k++) {
            updateBlock[targetIdx][2 + k] = kArr[k] !== undefined ? String(kArr[k]) : "";
          }
          updatedCount++;
        }
      }

      // Tulis ulang blok dalam 1 kali pemanggilan API (Sangat Cepat & Efisien!)
      if (updatedCount > 0) {
        targetSheet.getRange(2, 8, numRows, 12).setValues(updateBlock);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: `Berhasil update ${updatedCount} baris kendala & total sekolah. Dilewati (skip/0): ${skippedCount}`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // =====================================================================
    // PERCABANGAN 2: PENAMPUNG DATA LOG HARI (sync-logs / Default)
    // =====================================================================
    const { hariKe, logNumber, rows } = payload;
    if (!hariKe || !logNumber || !rows || !rows.length) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid payload untuk sync-logs" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const mlogSheet = ss.getSheetByName("masterLog");
    if (!mlogSheet) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Sheet masterLog tidak ditemukan" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Cari blok baris yang sudah ada untuk (Hari, Log) ini
    const data = mlogSheet.getDataRange().getValues();
    let startRow = -1;

    // Mulai dari baris 3 (karena baris 1-2 adalah header)
    for (let i = 2; i < data.length; i++) {
      const rowHari = data[i][2]; // Kolom C (Index 2) = Hari ke-
      const rowLog = data[i][1];  // Kolom B (Index 1) = Log ke-
      if (rowHari == hariKe && rowLog == logNumber) {
        startRow = i + 1; // Index array ke baris Google Sheet (1-based)
        break;
      }
    }

    // Tentukan posisi Paste
    if (startRow === -1) {
      startRow = Math.max(mlogSheet.getLastRow() + 1, 3);
    }

    // Paste baris sekaligus
    mlogSheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: `Berhasil menulis ${rows.length} baris log di baris ke-${startRow}`
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ================================================================
 * FUNGSI PEMBERSIHAN SATU KALI (One-Time Cleanup)
 * ================================================================
 */
function cleanupMasterLogDuplicates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("masterLog");
  if (!sheet) {
    Logger.log("Sheet masterLog tidak ditemukan!");
    return;
  }

  const data = sheet.getDataRange().getValues();
  Logger.log("Total baris di masterLog: " + data.length);

  const lastSeen = {};
  for (let i = 2; i < data.length; i++) {
    const namaFasil = (data[i][3] || "").toString().trim();
    const hari = data[i][2];
    const log  = data[i][1];
    if (!namaFasil || !hari) continue;
    const key = hari + "|" + log + "|" + namaFasil;
    lastSeen[key] = i;
  }

  const rowsToDelete = [];
  const seen = {};
  for (let i = 2; i < data.length; i++) {
    const namaFasil = (data[i][3] || "").toString().trim();
    const hari = data[i][2];
    const log  = data[i][1];
    if (!namaFasil || !hari) continue;
    const key = hari + "|" + log + "|" + namaFasil;

    if (seen[key] || i !== lastSeen[key]) {
      if (i !== lastSeen[key]) {
        rowsToDelete.push(i);
      }
    } else {
      seen[key] = true;
    }
  }

  Logger.log("Baris duplikat yang akan dihapus: " + rowsToDelete.length);

  if (rowsToDelete.length === 0) {
    Logger.log("Tidak ada duplikat! masterLog sudah bersih.");
    SpreadsheetApp.getUi().alert("✅ Tidak ada duplikat ditemukan. masterLog sudah bersih!");
    return;
  }

  rowsToDelete.sort(function(a, b) { return b - a; });
  for (let j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j] + 1);
  }

  Logger.log("Selesai! " + rowsToDelete.length + " baris duplikat dihapus.");
  SpreadsheetApp.getUi().alert(
    "🧹 Pembersihan Selesai!\n\n" +
    "Dihapus: " + rowsToDelete.length + " baris duplikat.\n" +
    "Sisa baris data: " + (data.length - 2 - rowsToDelete.length) + " baris."
  );
}
