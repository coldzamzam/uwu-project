import { getControllerEntry } from "./controller";

/** URL "edit" biasa - buat tombol "Buka Spreadsheet" (target=_blank). null
 * kalau fasilitator ybs belum ada di controller (lihat lib/controller.ts). */
export async function getFacilitatorLkEditUrl(kodeFasil: string): Promise<string | null> {
  const entry = await getControllerEntry(kodeFasil);
  if (!entry) return null;
  return `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/edit?gid=${entry.gid}`;
}

/** URL export CSV - buat dibaca aplikasi (fetch server-side). */
export async function getFacilitatorLkCsvUrl(kodeFasil: string): Promise<string | null> {
  const entry = await getControllerEntry(kodeFasil);
  if (!entry) return null;
  return `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/export?format=csv&gid=${entry.gid}`;
}

/** URL "edit" biasa ke spreadsheet "LK Fasilitator" (kolom G, LK Fasil
 * pribadi sebenarnya) - beda dari getFacilitatorLkEditUrl() di atas yang
 * merujuk ke "LK Log" (kolom F). null kalau fasilitator belum ada di
 * controller ATAU kolom "LK Fasilitator"-nya kosong/tidak valid. */
export async function getFacilitatorLkFasilEditUrl(kodeFasil: string): Promise<string | null> {
  const entry = await getControllerEntry(kodeFasil);
  if (!entry?.lkFasilSpreadsheetId) return null;
  return `https://docs.google.com/spreadsheets/d/${entry.lkFasilSpreadsheetId}/edit?gid=${entry.lkFasilGid}`;
}
