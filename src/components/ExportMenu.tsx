import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import { ExportFormat } from "@/lib/exportTable";

interface Props {
  onExport: (format: ExportFormat) => Promise<void> | void;
  disabled?: boolean;
  title?: string;
}

// Nút "Export" + menu nhỏ chọn định dạng (CSV / Excel) — dùng ở Participants và Dashboard.
export default function ExportMenu({ onExport, disabled, title }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function choose(format: ExportFormat) {
    setOpen(false);
    setBusy(true);
    try {
      await onExport(format);
    } finally {
      setBusy(false);
    }
  }

  const itemClass = "block w-full px-3 py-2 text-left text-sm text-base-100 hover:bg-base-800";

  return (
    <div ref={wrapRef} className="relative">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)} disabled={disabled || busy} title={title}>
        Export ▾
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[160px] rounded-lg border border-base-700 bg-base-900 py-1 shadow-2xl">
          <button onClick={() => choose("xlsx")} className={itemClass}>
            Excel (.xlsx)
          </button>
          <button onClick={() => choose("csv")} className={itemClass}>
            CSV (.csv)
          </button>
        </div>
      )}
    </div>
  );
}
