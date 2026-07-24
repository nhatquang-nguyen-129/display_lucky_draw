import { useRef, useState } from "react";
import { ButtonComponent, DrawSequenceActions, LandingData, getParticipantExtraField } from "@/lib/landing/types";

const ACTION_LABELS: Record<ButtonComponent["props"]["action"], string> = {
  draw: "Draw",
  confirm: "Confirm",
  redo: "Redo",
  openLink: "Open Link",
};

const NO_WHEEL_WARNING = "No Lucky Wheel found on this page — add one so a draw actually shows.";

// sequence = undefined trong Builder canvas (không tương tác) — luôn disabled ở đó, NHƯNG vẫn hiện
// full độ đậm (không mờ) vì lý do disabled ở Builder chỉ là "chưa vào Present Mode", không phải
// "tạm thời không bấm được" — 2 lý do khác nhau, khác cách hiển thị (xem showFaded bên dưới).
export default function ButtonView({
  component,
  data,
  sequence,
  hasWheel,
}: {
  component: ButtonComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
  // Có ít nhất 1 component luckyWheel trên trang hay không (xem LandingRenderer.tsx) — action
  // "draw" vẫn kỹ thuật hoạt động được nếu thiếu, nhưng người vận hành bấm sẽ không thấy gì diễn
  // ra trên màn hình nên cần cảnh báo thay vì âm thầm pick() một candidate không ai nhìn thấy.
  hasWheel?: boolean;
}) {
  const { action, label, fontSize, color, backgroundColor, borderRadius, strokeColor, strokeWidth, urlField } =
    component.props;
  const [warning, setWarning] = useState<string | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const winnerParticipant = sequence?.candidate
    ? data?.participants.find((p) => p.id === sequence.candidate!.participantId)
    : undefined;
  const winnerUrl = winnerParticipant ? getParticipantExtraField(winnerParticipant, urlField) : null;

  const disabled =
    !sequence ||
    sequence.busy ||
    (action === "draw"
      ? sequence.isPending
      : action === "openLink"
        ? !winnerUrl
        : !sequence.isPending);
  // Chỉ làm mờ khi ĐANG ở Present Mode thật (có sequence) mà tạm thời không bấm được (sai phase/busy/
  // chưa có URL) — ở Builder (sequence undefined) luôn hiện full độ đậm, tránh nhìn như "trong suốt".
  const showFaded = !!sequence && disabled;

  // Giải thích lý do disabled NGAY TRONG Present Mode thật — trước đây chỉ có tooltip cho ca Builder
  // (!sequence), nên khi sequence.isPending khoá nút Draw (còn 1 candidate CHƯA Confirm/Redo — không
  // liên quan gì tới field nào đang chọn ở Lucky Wheel) người vận hành không có cách nào biết vì sao,
  // dễ tưởng nhầm là lỗi field/data.
  let presentModeHint: string | undefined;
  if (sequence) {
    if (sequence.busy) presentModeHint = "Busy — please wait a moment.";
    else if (action === "draw" && sequence.isPending) presentModeHint = "A candidate is already pending — Confirm or Redo it first.";
    else if ((action === "confirm" || action === "redo") && !sequence.isPending) presentModeHint = "No pending candidate — press Draw first.";
    else if (action === "openLink" && !winnerUrl) presentModeHint = "No URL available for the current winner yet.";
  }

  function showWarning(message: string) {
    setWarning(message);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    warningTimeoutRef.current = setTimeout(() => setWarning(null), 3000);
  }

  function handleClick() {
    if (!sequence || disabled) return;
    if (action === "draw") {
      if (!hasWheel) {
        showWarning(NO_WHEEL_WARNING);
        return;
      }
      sequence.pick();
    } else if (action === "confirm") sequence.confirm();
    else if (action === "redo") sequence.redo();
    else if (action === "openLink" && winnerUrl) window.api.shell.openExternal(winnerUrl);
  }

  return (
    // LandingRenderer đặt pointer-events: none mặc định lên khung của MỌI component (tránh khung
    // trống của 1 component to đè lên nuốt mất click của component khác) — Button là loại DUY NHẤT
    // cần bắt click thật ở Present Mode nên tự bật lại pointer-events: auto ở đây.
    <div className="relative h-full w-full" style={{ pointerEvents: "auto" }}>
      {warning && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-highlight-500 bg-base-900 px-3 py-2 text-center text-xs text-highlight-500 shadow-xl">
          {warning}
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={!sequence ? "Buttons are only active in Present Mode" : presentModeHint}
        className="flex h-full w-full items-center justify-center font-medium shadow-lg transition-opacity disabled:cursor-not-allowed"
        style={{
          fontSize,
          color,
          backgroundColor,
          borderRadius,
          borderStyle: "solid",
          borderWidth: strokeWidth,
          borderColor: strokeColor,
          opacity: showFaded ? 0.4 : 1,
        }}
      >
        {label || ACTION_LABELS[action]}
      </button>
    </div>
  );
}
