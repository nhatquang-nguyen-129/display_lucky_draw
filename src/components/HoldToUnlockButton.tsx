import { useRef, useState } from "react";

const HOLD_MS = 3000;

// Giữ chuột/chạm đủ HOLD_MS mới gọi onConfirm — dùng cho thao tác "nguy hiểm" cần tránh bấm nhầm
// (mở khoá session). Thả ra sớm thì huỷ, thanh fill rút nhanh về 0. Cùng kỹ thuật fill bằng CSS
// transition (không requestAnimationFrame) như nút Confirm/Reset trên Landing (xem
// ButtonView.tsx/useHoldToRun) — mượt hơn vì để trình duyệt tự nội suy, không phụ thuộc tần suất
// setState — chỉ khác màu: ở đây xanh lá SUỐT quá trình giữ (không đợi tới lúc giữ đủ mới đổi màu)
// để thấy ngay là đang giữ đúng, phù hợp 1 hành động DUY NHẤT (không cần phân biệt nhiều action như
// ButtonView).
type HoldPhase = "idle" | "holding";

export default function HoldToUnlockButton({ onConfirm }: { onConfirm: () => void }) {
  const [phase, setPhase] = useState<HoldPhase>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    if (timerRef.current) return;
    setPhase("holding");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPhase("idle");
      onConfirm();
    }, HOLD_MS);
  }

  function cancel() {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    setPhase("idle");
  }

  return (
    <button
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={start}
      onTouchEnd={cancel}
      className="relative w-full overflow-hidden rounded-lg border border-base-700 bg-base-800 px-4 py-3 text-sm font-medium text-base-100 select-none"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0"
        style={{
          width: phase === "holding" ? "100%" : "0%",
          backgroundColor: "rgba(22, 163, 74, 0.92)",
          transitionProperty: "width",
          transitionDuration: phase === "holding" ? `${HOLD_MS}ms` : "150ms",
          transitionTimingFunction: phase === "holding" ? "linear" : "ease-out",
        }}
      />
      <span className="relative">Hold to unlock (3s)</span>
    </button>
  );
}
