import type { CheckpointGroup, CheckpointIndicator } from "./knowledge/checkpoints";
import type { IndicatorCompliance } from "./compliance";

export type SeverityTier = "hijau" | "kuning" | "oranye" | "merah";

export const TIER_LABEL: Record<SeverityTier, string> = { hijau: "Hijau", kuning: "Kuning", oranye: "Oranye", merah: "Merah" };

export const TIER_RANK: Record<SeverityTier, number> = { hijau: 0, kuning: 1, oranye: 2, merah: 3 };

/** Acuan admin untuk mengklasifikasi tingkat keparahan checkpoint, dikonversi
 * dulu ke "problemPct" seragam (makin tinggi makin buruk) supaya kolom
 * "positif" (higherIsBetter, target 100%) dan "negatif" (target 0%) bisa
 * dipetakan ke SATU set ambang batas - keduanya cerminan satu sama lain lewat
 * (100 - x). Hijau HANYA untuk yang PERSIS capai target (0% masalah / 100%
 * lengkap) - begitu ada masalah sedikit pun (>0%), langsung masuk kuning
 * (v2, atas permintaan program owner 2026-07-16 - beda dari v1 yang masih
 * kasih toleransi 0-10% "hampir sempurna" ikut dianggap hijau). */
export function classifySeverity(raw: number, polarity: CheckpointIndicator["polarity"]): SeverityTier {
  const problemPct = polarity === "higherIsBetter" ? 100 - raw : raw;
  return problemPct <= 0 ? "hijau" : problemPct <= 30 ? "kuning" : problemPct <= 70 ? "oranye" : "merah";
}

/** Tier hijau TIDAK PERNAH dipakai untuk sesuatu yang masih "violation"/"Belum
 * Sesuai" - hijau berarti "tidak perlu tindakan", yang kontradiktif kalau
 * dipasang bareng status yang masih gagal capai target. Kuning jadi lantai
 * (tier paling ringan yang boleh tampil) untuk kasus begitu - dekat target
 * tetap ditandai beda dari yang jauh (oranye/merah), tapi tidak pernah
 * disamarkan jadi "sudah oke". Dipakai bareng oleh CheckpointCompliancePanel
 * & MilestoneTimeline supaya checkpoint yang belum capai target tidak pernah
 * tampil hijau di kedua tempat itu. */
export function clampToNonHijau(tier: SeverityTier): SeverityTier {
  return tier === "hijau" ? "kuning" : tier;
}

/** Severity satu indikator gating/info, atau null kalau tidak berlaku (kolom
 * enum "Sudah"/"Belum" mis. fasilBelumLoginLK, atau raw bukan angka/tidak ada
 * data untuk dinilai). Dipakai bareng oleh prompt LLM (lib/prompts.ts) dan
 * panel UI (CheckpointCompliancePanel) supaya warna/label tingkat keparahan
 * yang ditampilkan ke admin SELALU konsisten dengan yang disebut AI - satu
 * sumber kebenaran, bukan status biner "Belum Sesuai" = merah begitu saja
 * (mis. indikator "Kuning" di 89% tidak boleh ikut ditampilkan semerah
 * indikator yang benar-benar 0%, walau checkpoint-nya sama-sama "Belum Sesuai"
 * karena targetnya persis 100%). */
export function indicatorSeverity(ind: IndicatorCompliance, group: CheckpointGroup): SeverityTier | null {
  if (ind.kolom === "fasilBelumLoginLK") return null;
  const raw = parseFloat(ind.detail);
  if (Number.isNaN(raw)) return null;
  const polarity = group.indicators.find((gi) => gi.kolom === ind.kolom)?.polarity;
  return classifySeverity(raw, polarity);
}
