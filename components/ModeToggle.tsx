import Link from "next/link";

export function ModeToggle({
  mode,
  basePath = "/",
  extraParams,
}: {
  mode: "alltime" | "harian";
  basePath?: string;
  extraParams?: Record<string, string>;
}) {
  const tab = (value: "alltime" | "harian", label: string) => {
    const active = mode === value;
    const params = new URLSearchParams({ ...extraParams, mode: value });
    return (
      <Link
        href={`${basePath}?${params.toString()}`}
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
      {tab("alltime", "Semua Waktu")}
      {tab("harian", "Per Hari")}
    </div>
  );
}
