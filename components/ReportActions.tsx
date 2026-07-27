"use client";

import { useState } from "react";

export function ReportActions({ text, filename }: { text: string; filename: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex gap-3">
      <button onClick={copy} className="btn-primary !py-2 !px-4 !text-xs">
        {copied ? "Tersalin!" : "Salin sebagai Teks"}
      </button>
      <button onClick={download} className="btn-secondary !py-2 !px-4 !text-xs">
        Unduh .txt
      </button>
    </div>
  );
}
