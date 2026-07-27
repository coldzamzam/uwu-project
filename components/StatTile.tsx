export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "critical";
}) {
  const valueColor =
    tone === "critical" ? "text-status-critical" : tone === "warning" ? "text-status-warning" : "text-ink-primary";
  return (
    <div className="card p-5">
      <div className="text-body-md text-ink-secondary">{label}</div>
      <div className={`mt-2 text-title-lg ${valueColor}`}>{value}</div>
    </div>
  );
}
