export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle">
      <span
        tabIndex={0}
        className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border-strong text-[10px] leading-none text-ink-muted focus:outline-none"
        aria-label={text}
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-[var(--radius-sm)] border border-hairline bg-surface px-3 py-2 text-xs text-ink-secondary opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
