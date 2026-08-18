import { useState } from "react";
import Button from "@/components/Button";
import EscapeKeyHandler from "./EscapeKeyHandler";

// Popup nhập số lượng khi chọn "Multiple Draw"/"Quick Draw" trong dropdown cạnh nút Draw (xem
// DrawMenu trong ButtonView.tsx) — CÙNG style/backdrop/EscapeKeyHandler với popup confirmPrompt/
// infoPrompt (LandingRenderer.tsx), chỉ khác có thêm 1 ô nhập số. Sống ở ĐÂY (không phải cục bộ
// trong ButtonView.tsx) vì cần phủ TOÀN BỘ canvas đã scale — 1 Button riêng lẻ không có toạ độ đó,
// chỉ LandingRenderer.tsx (gốc canvas) mới có, xem doc-comment DrawSequenceActions.drawModePrompt
// trong types.ts. Xác nhận popup này CHỈ "arm" chế độ + số lượng (confirmDrawModePrompt) — KHÔNG tự
// chạy draw, người vận hành phải tự bấm nút Draw chính để thật sự tiến hành.
export default function DrawModeCountPopup({
  mode,
  prizeName,
  max,
  initialValue,
  onCancel,
  onConfirm,
}: {
  mode: "multiple" | "quick";
  prizeName: string;
  max: number;
  initialValue: number;
  onCancel: () => void;
  onConfirm: (count: number) => void;
}) {
  const [value, setValue] = useState(String(initialValue));
  const parsed = Number(value);
  const tooHigh = Number.isFinite(parsed) && parsed > max;
  const tooLow = !Number.isFinite(parsed) || parsed < 1;
  const valid = !tooHigh && !tooLow;

  const title = mode === "multiple" ? "Multiple Draw" : "Quick Draw";
  const helpText =
    mode === "multiple"
      ? "Each winner is drawn, shown, and auto-confirmed one at a time."
      : "All winners are drawn and confirmed immediately, with no per-person reveal.";

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
      style={{ pointerEvents: "auto" }}
      onClick={onCancel}
    >
      <EscapeKeyHandler onEscape={onCancel} />
      <div
        className="w-[420px] max-w-[90%] rounded-xl bg-base-950 p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-medium text-base-100">{title} — how many winners for "{prizeName}"?</p>
        <p className="mt-1 text-xs text-base-500">
          {helpText} Up to {max} remaining.
        </p>
        <input
          type="number"
          min={1}
          max={max}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-4 w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-center text-lg text-base-100 outline-none focus:border-gold-500"
        />
        {(tooHigh || (tooLow && value !== "")) && (
          <p className="mt-2 text-xs text-danger-500">
            {tooHigh ? `Only ${max} remaining for "${prizeName}" — enter ${max} or fewer.` : "Enter at least 1."}
          </p>
        )}
        <div className="mt-5 flex justify-center gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => valid && onConfirm(parsed)}>
            Set Mode
          </Button>
        </div>
      </div>
    </div>
  );
}
