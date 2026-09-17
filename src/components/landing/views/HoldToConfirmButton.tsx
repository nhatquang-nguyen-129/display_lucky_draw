import { useRef, useState } from "react";

// Nút "Confirm" bắt GIỮ đủ `holdMs` (không phải bấm 1 phát) mới thật sự chạy — dùng cho action phá
// dữ liệu nặng tay hơn hẳn 1 lượt Confirm thường (hiện chỉ "reset", xem CONFIRM_HOLD_MS trong
// ButtonView.tsx). Lớp phủ đen mờ dần đầy theo chiều ngang đúng `holdMs` (CSS transition, không
// timer riêng nào khác cho phần vẽ) làm mốc thời gian cho người bấm biết còn giữ bao lâu nữa — thả
// tay ra sớm thì lớp phủ tự lùi về 0 nhanh (150ms) và HUỶ timer thật, không chạy `onConfirm`.
export default function HoldToConfirmButton({
  holdMs,
  onConfirm,
  children,
}: {
  holdMs: number;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      onConfirm();
    }, holdMs);
  }

  function cancel() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  }

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className="relative select-none overflow-hidden rounded-lg bg-danger-500 px-4 py-2 text-sm font-medium text-white"
    >
      <span
        className="absolute inset-y-0 left-0 bg-black/25"
        style={{
          width: holding ? "100%" : "0%",
          transitionProperty: "width",
          transitionDuration: holding ? `${holdMs}ms` : "150ms",
          transitionTimingFunction: holding ? "linear" : "ease-out",
        }}
      />
      <span className="relative">{children}</span>
    </button>
  );
}
