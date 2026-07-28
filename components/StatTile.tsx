export type StatTileVariant =
  | "default"
  | "soft"
  | "cream"
  | "mint"
  | "peach"
  | "yellow"
  | "mustard"
  | "coral"
  | "forest"
  | "dark";

export function StatTile({
  label,
  value,
  tone = "default",
  variant,
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "critical";
  variant?: StatTileVariant;
}) {
  // Tentukan warna teks standar berdasarkan tone jika tidak dioverride oleh background gelap
  const valueColor =
    tone === "critical" ? "text-status-critical font-bold" : tone === "warning" ? "text-status-warning font-semibold" : "text-ink-primary";

  // Mapping dari gaya Demo-Grid & Signature Card Airtable
  let containerStyle = "card p-5";
  let labelStyle = "text-body-md text-ink-secondary";
  let finalValueStyle = `mt-2 text-title-lg ${valueColor}`;

  if (variant === "cream") {
    containerStyle = "rounded-[var(--radius-md)] border border-[#e8dac5] bg-[#f5e9d4] p-5 shadow-none transition-transform hover:-translate-y-0.5 duration-200";
    labelStyle = "text-body-md font-medium text-[#181d26]/80";
    finalValueStyle = "mt-2 text-title-lg font-semibold text-[#181d26]";
  } else if (variant === "mint") {
    containerStyle = "rounded-[var(--radius-md)] border border-[#97c7b3] bg-[#a8d8c4] p-5 shadow-none transition-transform hover:-translate-y-0.5 duration-200";
    labelStyle = "text-body-md font-medium text-[#0a2e0e]/80";
    finalValueStyle = "mt-2 text-title-lg font-semibold text-[#0a2e0e]";
  } else if (variant === "peach") {
    containerStyle = "rounded-[var(--radius-md)] border border-[#eb9c6c] bg-[#fcab79] p-5 shadow-none transition-transform hover:-translate-y-0.5 duration-200";
    labelStyle = "text-body-md font-medium text-[#181d26]/80";
    finalValueStyle = "mt-2 text-title-lg font-semibold text-[#181d26]";
  } else if (variant === "yellow") {
    containerStyle = "rounded-[var(--radius-md)] border border-[#e3c24d] bg-[#f4d35e] p-5 shadow-none transition-transform hover:-translate-y-0.5 duration-200";
    labelStyle = "text-body-md font-medium text-[#181d26]/80";
    finalValueStyle = "mt-2 text-title-lg font-semibold text-[#181d26]";
  } else if (variant === "mustard") {
    containerStyle = "rounded-[var(--radius-md)] border border-[#c89433] bg-[#d9a441] p-5 shadow-none transition-transform hover:-translate-y-0.5 duration-200";
    labelStyle = "text-body-md font-medium text-[#181d26]/90";
    finalValueStyle = "mt-2 text-title-lg font-semibold text-[#181d26]";
  } else if (variant === "coral") {
    containerStyle = "rounded-[var(--radius-md)] bg-[#aa2d00] p-5 shadow-sm text-white transition-transform hover:-translate-y-0.5 duration-200";
    labelStyle = "text-body-md font-medium text-white/90";
    finalValueStyle = "mt-2 text-title-lg font-bold text-white tracking-tight";
  } else if (variant === "forest") {
    containerStyle = "rounded-[var(--radius-md)] bg-[#0a2e0e] p-5 shadow-sm text-white transition-transform hover:-translate-y-0.5 duration-200";
    labelStyle = "text-body-md font-medium text-white/90";
    finalValueStyle = "mt-2 text-title-lg font-bold text-white tracking-tight";
  } else if (variant === "dark") {
    containerStyle = "rounded-[var(--radius-md)] bg-[#181d26] p-5 shadow-sm text-white transition-transform hover:-translate-y-0.5 duration-200";
    labelStyle = "text-body-md font-medium text-white/80";
    finalValueStyle = "mt-2 text-title-lg font-bold text-white tracking-tight";
  } else if (variant === "soft") {
    containerStyle = "rounded-[var(--radius-md)] border border-hairline bg-surface-soft p-5 shadow-none";
  }

  return (
    <div className={containerStyle}>
      <div className={labelStyle}>{label}</div>
      <div className={finalValueStyle}>{value}</div>
    </div>
  );
}
