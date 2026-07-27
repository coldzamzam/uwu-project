import Link from "next/link";

export function AnalysisScopeTabs({ tab }: { tab: "fasilitator" | "harian" }) {
  const tabLink = (value: "fasilitator" | "harian", label: string) => {
    const active = tab === value;
    return (
      <Link
        href={`/analisis-massal?tab=${value}`}
        className={`rounded-[var(--radius-lg)] px-4 py-1.5 text-body-md transition-colors ${
          active ? "bg-primary text-on-primary" : "text-ink-secondary hover:text-ink-primary"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="inline-flex gap-0.5 rounded-[var(--radius-lg)] border border-hairline bg-background p-0.5">
      {tabLink("fasilitator", "Per Fasilitator")}
      {tabLink("harian", "Ringkasan Harian")}
    </div>
  );
}
