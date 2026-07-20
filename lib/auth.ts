import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";
import { ADMIN_EMAIL_MAP } from "./admins";

/**
 * Login Google + whitelist email, GANTI dari alur berbasis webhook Apps
 * Script (lihat lib/writeSheet.ts) - tujuan akhirnya supaya baca/tulis sheet
 * bisa langsung lewat token OAuth admin yang login, tanpa perlu deploy script
 * terpisah lagi. Untuk sekarang scope-nya baru gerbang login + pemilihan
 * admin (lihat lib/admins.ts) - pemakaian token OAuth untuk baca/tulis
 * "masterLog" menyusul.
 *
 * ADMIN_EMAILS kosong = Cek terhadap ADMIN_EMAIL_MAP (di lib/admins.ts). 
 * Kalau email tidak ada di map dan env var kosong = TOLAK (fail-closed).
 */
const envEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Access token Google cuma berlaku ~1 jam - tanpa ini, sesi yang lebih tua
 * dari itu bakal terus bawa accessToken KEDALUWARSA (masih ada nilainya,
 * jadi TIDAK ketangkep pengecekan `!accessToken` di API routes, malah gagal
 * belakangan dengan error 401 dari Google sendiri pas dipakai baca/tulis
 * sheet). Pakai refresh_token (didapat sekali di awal via `access_type:
 * "offline"`) buat minta accessToken baru begitu kedaluwarsa. */
async function refreshGoogleAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: String(token.refreshToken ?? ""),
      }),
    });
    const refreshed = await res.json();
    if (!res.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      // Google TIDAK selalu mengirim refresh_token baru tiap refresh - pertahankan yang lama kalau tidak ada.
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (err) {
    console.warn("[auth] Gagal refresh Google access token:", err);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      // Nama env var eksplisit GOOGLE_CLIENT_ID/SECRET (bukan default
      // AUTH_GOOGLE_ID/SECRET Auth.js v5) - sesuai istilah "Client ID"/
      // "Client Secret" yang dipakai Google Cloud Console.
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid profile email https://www.googleapis.com/auth/spreadsheets",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      const isMappedAdmin = email ? !!ADMIN_EMAIL_MAP[email] : false;
      const isEnvAdmin = email ? envEmails.includes(email) : false;

      if (!isMappedAdmin && !isEnvAdmin) {
        console.warn(`[auth] Login ditolak untuk "${email ?? "(tanpa email)"}" - tidak ada di ADMIN_EMAIL_MAP maupun env ADMIN_EMAILS.`);
        return false;
      }
      return true;
    },
    async jwt({ token, account }) {
      // Pada saat login pertama kali, object `account` akan tersedia. Kita
      // ambil `access_token`+`refresh_token`+expiry-nya dan simpan ke token
      // JWT agar bisa dipakai baca/tulis sheets.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000;
        return token;
      }

      // Request-request setelahnya (bukan login baru): kalau access token
      // Google (berlaku ~1 jam) belum kedaluwarsa, pakai apa adanya.
      if (typeof token.accessTokenExpires === "number" && Date.now() < token.accessTokenExpires) {
        return token;
      }
      // Sudah/mau kedaluwarsa - refresh dulu supaya baca/tulis sheet TIDAK
      // gagal cuma karena sesi sudah berumur >1 jam (lihat komentar
      // refreshGoogleAccessToken di atas).
      return refreshGoogleAccessToken(token);
    },
    async session({ session, token }) {
      // Overwrite/tambahkan property accessToken ke session yang dikonsumsi aplikasi
      // (Bypass typescript check sementara karena Types default NextAuth tidak punya accessToken)
      // @ts-expect-error - field custom, types default next-auth Session tidak punya accessToken
      session.accessToken = token.accessToken;
      return session;
    },
  },
});
