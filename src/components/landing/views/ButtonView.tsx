import { useState } from "react";
import { ButtonComponent, DrawSequenceActions } from "@/lib/landing/types";
import { useTriggerCommands } from "../useTriggerCommands";

// Signal EMITTER thuần (xem CLAUDE.md) — CHỈ phát "Button.Click" khi được bấm, không tự chạy bất kỳ
// business logic nào (không gọi IPC, không biết Draw/Confirm/Reset/... là gì). sequence = undefined
// ở Builder canvas (không tương tác) — luôn disabled ở đó để tránh bấm nhầm lúc đang chỉnh sửa.
//
// "Gateable Emitter" (ngoại lệ hẹp thứ 2, xem checklist đầu types.ts) — listensFor thêm đúng 2
// Command chung "Button.Enable"/"Button.Disable" để 1 Signal bất kỳ trên Graph khoá/mở được nút này
// (vd Wheel.SpinCompleted → Confirm.Enable, để nút Confirm chỉ bấm được SAU KHI quay xong). `gateOpen`
// KHÔNG phải business state — chỉ là 1 boolean được set bởi đúng 2 Command này, Button hoàn toàn
// không biết TẠI SAO nó bị khoá/mở.
export default function ButtonView({
  component,
  sequence,
}: {
  component: ButtonComponent;
  sequence?: DrawSequenceActions;
}) {
  const { label, fontSize, color, backgroundColor, borderRadius, strokeColor, strokeWidth, startEnabled } =
    component.props;
  const [gateOpen, setGateOpen] = useState(startEnabled);

  useTriggerCommands(component.triggerActions, sequence, (command) => {
    if (command === "Button.Enable") setGateOpen(true);
    else if (command === "Button.Disable") setGateOpen(false);
  });

  const disabled = !sequence || !gateOpen;
  // Chỉ làm mờ khi bị khoá THẬT ở Present Mode (gate đóng) — KHÔNG áp dụng cho lý do "đang ở
  // Builder" (sequence undefined), vì lúc đó vẫn cần thấy đúng màu sắc thật để canh chỉnh, không
  // phải trạng thái "disabled" theo nghĩa gate.
  const gatedOff = !!sequence && !gateOpen;

  function handleClick() {
    if (disabled) return;
    sequence!.fireClick(component.id);
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
        title={
          !sequence
            ? "Buttons are only active in Present Mode"
            : !gateOpen
              ? "Disabled — waiting for a Button.Enable signal from the Trigger Graph"
              : undefined
        }
        className="flex h-full w-full items-center justify-center font-medium shadow-lg transition-opacity disabled:cursor-not-allowed"
        style={{
          fontSize,
          color,
          backgroundColor,
          borderRadius,
          borderStyle: "solid",
          borderWidth: strokeWidth,
          borderColor: strokeColor,
          opacity: gatedOff ? 0.5 : 1,
        }}
      >
        {label}
      </button>
    </div>
  );
}
