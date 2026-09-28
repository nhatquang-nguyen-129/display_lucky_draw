import { useRef, useState } from "react";

const HOLD_MS = 3000;

// Giữ chuột/chạm đủ HOLD_MS mới gọi onConfirm — dùng cho thao tác "nguy hiểm" cần tránh bấm nhầm
// (mở khoá session). Thả ra sớm thì huỷ, thanh fill chạy lại từ 0.
export default function HoldToUnlockButton({ onConfirm }: { onConfirm: () => void }) {
  const [progress, setProgress] = useState(0); // 0..100
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  function stop() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setProgress(0);
  }

  function tick() {
    if (startRef.current === null) return;
    const elapsed = performance.now() - startRef.current;
    const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
    setProgress(pct);
    if (pct >= 100) {
      stop();
      onConfirm();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function start() {
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }

  return (
    <button
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={start}
      onTouchEnd={stop}
      className="relative w-full overflow-hidden rounded-lg border border-base-700 bg-base-800 px-4 py-3 text-sm font-medium text-base-100 select-none"
    >
      <span
        className="absolute inset-y-0 left-0 bg-gold-500/70 transition-[width] duration-75 ease-linear"
        style={{ width: `${progress}%` }}
      />
      <span className="relative">Hold to unlock (3s)</span>
    </button>
  );
}
