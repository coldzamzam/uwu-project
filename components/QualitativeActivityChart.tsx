"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayActivity } from "@uwu/core/notes";

export function QualitativeActivityChart({ data }: { data: DayActivity[] }) {
  const chartData = data.map((d) => ({ hari: `H${d.hari}`, "Catatan ditulis": d.catatanAsli, "Belum diisi": d.belumDiisi }));

  return (
    <div className="card p-6">
      <p className="mb-3 text-body-md text-ink-muted">
        Jumlah entri kualitatif (Kendala/Analisis/Catatan Admin) yang ditulis tiap hari, digabung dari semua
        fasilitator. Ini proxy aktivitas lapangan - metrik angka lain statis antar hari, jadi tidak ada tren berarti
        untuk ditampilkan dari situ.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke="var(--hairline)" vertical={false} />
          <XAxis dataKey="hari" tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={{ stroke: "var(--border-strong)" }} tickLine={false} />
          <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
          <Tooltip contentStyle={{ background: "var(--background)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-md)", fontSize: 12 }} labelStyle={{ color: "var(--ink-primary)" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-secondary)" }} />
          <Bar dataKey="Catatan ditulis" stackId="a" fill="var(--series-1)" radius={[0, 0, 0, 0]} maxBarSize={24} />
          <Bar dataKey="Belum diisi" stackId="a" fill="var(--series-3)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
