import { ButtonComponent, DrawSequenceActions } from "@/lib/landing/types";

// Signal EMITTER thuần (xem CLAUDE.md) — CHỈ phát "Button.Click" khi được bấm, không tự chạy bất kỳ
// business logic nào (không gọi IPC, không biết Draw/Confirm/Reset/... là gì). sequence = undefined
// ở Builder canvas (không tương tác) — luôn disabled ở đó để tránh bấm nhầm lúc đang chỉnh sửa.
export default function ButtonView({
  component,
  sequence,
}: {
  component: ButtonComponent;
  sequence?: DrawSequenceActions;
}) {
  const { label, fontSize, color, backgroundColor, borderRadius, strokeColor, strokeWidth } = component.props;
  const disabled = !sequence;

  function handleClick() {
    if (!sequence) return;
    sequence.fireClick(component.id);
  }

  return (
    // LandingRenderer đặt pointer-events: none mặc định lên khung của MỌI component (tránh khung
    // trống của 1 component to đè lên nuốt mất click của component khác) — Button là loại DUY NHẤT
    // cần bắt click thật ở Present Mode nên tự bật lại pointer-events: auto ở đây.
    <div className="relative h-full w-full" style={{ pointerEvents: "auto" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={disabled ? "Buttons are only active in Present Mode" : undefined}
        className="flex h-full w-full items-center justify-center font-medium shadow-lg transition-opacity disabled:cursor-not-allowed"
        style={{
          fontSize,
          color,
          backgroundColor,
          borderRadius,
          borderStyle: "solid",
          borderWidth: strokeWidth,
          borderColor: strokeColor,
        }}
      >
        {label}
      </button>
    </div>
  );
}
