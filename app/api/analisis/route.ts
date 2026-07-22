import { NextResponse } from "next/server";
import { fetchAnalisisTable } from "@/lib/writeSheet";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** API Route ringan khusus untuk mengambil teks "Analisis" yang sudah ada
 * di spreadsheet LK fasilitator — dipanggil CLIENT-SIDE oleh
 * FacilitatorAnalysisWorkbench supaya panel Workbench bisa render INSTAN
 * (tanpa Suspense/skeleton) lalu mengisi textarea begitu data tiba. */
export async function GET(request: Request) {
  const session = await auth();
  // @ts-expect-error accessToken ada di config JWT NextAuth kita
  const accessToken = session?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ analisis: null });
  }

  const { searchParams } = new URL(request.url);
  const kode = searchParams.get("kode");
  const hariStr = searchParams.get("hari");
  if (!kode || !hariStr) {
    return NextResponse.json({ error: "kode dan hari wajib" }, { status: 400 });
  }

  const hari = parseInt(hariStr, 10);
  const table = await fetchAnalisisTable(kode, accessToken);
  const analisis = table?.get(hari) || null;

  return NextResponse.json({ analisis });
}
