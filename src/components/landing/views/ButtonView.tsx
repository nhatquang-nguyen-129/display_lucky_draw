import { ButtonAction, ButtonComponent, DrawSequenceActions, getParticipantField, LandingData } from "@/lib/landing/types";

// 2 action ghi dữ liệu THẬT, VĨNH VIỄN (xem docs/landing-builder.md mục 6) — bắt buộc xác nhận qua
// popup (sequence.requestConfirm(), vẽ ở LandingRenderer.tsx) trước khi thật sự chạy, tránh bấm
// nhầm giữa lúc trình chiếu trực tiếp. Action còn lại không cần — hoặc vô hại (draw/
// toggleScoreboard/openLink không ghi gì bất thuận nghịch), hoặc đã tự no-op an toàn sẵn.
const CONFIRM_MESSAGES: Partial<Record<ButtonAction, string>> = {
  confirm: "Are you sure you want to confirm this winner? This will be saved permanently.",
  reset: "Are you sure you want to reset the session? All draw results will be permanently deleted.",
};

// Bấm là chạy đúng 1 action cố định đã chọn trong Properties Panel — gọi thẳng hàm tương ứng của
// DrawSequenceActions, không qua tín hiệu/trung gian nào (trừ "confirm"/"reset" phải qua popup xác
// nhận trước, xem CONFIRM_MESSAGES + handleClick bên dưới). "openLink" đọc URL từ field đã chọn
// của winner GẦN NHẤT (data.results[0]) — no-op im lặng nếu chưa có winner hoặc field rỗng, giữ
// đúng triết lý "bấm nhầm lúc chưa có gì thì không xảy ra chuyện gì", không báo lỗi phiền người vận hành.
function runAction(component: ButtonComponent, sequence: DrawSequenceActions, data: LandingData | undefined) {
  const { action, urlField } = component.props;
  switch (action) {
    case "draw":
      // Draw và Redraw/Discard đã GỘP LÀM 1 nút — đang có candidate CHỜ CONFIRM (isPending) thì bấm
      // "Draw" nghĩa là "quay lại", tự chạy redo() (rút lại candidate đang chờ, chọn lại đúng giải
      // đó cho người khác); chưa có gì chờ thì mới thật sự pick() 1 candidate mới.
      if (sequence.isPending) {
        sequence.redo();
      } else {
        sequence.pick().catch(() => {
          // Lỗi (hết participant/prize, lỗi IPC...) đã có sequence.error hiện riêng — không cần làm gì thêm ở đây.
        });
      }
      return;
    case "confirm":
      sequence.confirm();
      return;
    case "reset":
      sequence.resetSession();
      return;
    case "toggleScoreboard":
      sequence.toggleScoreboard();
      return;
    case "openLink": {
      const winnerRow = data?.results?.[0];
      const participant = winnerRow ? data?.participants.find((p) => p.id === winnerRow.participant_id) : undefined;
      const url = participant ? getParticipantField(participant, urlField ?? "") : "";
      if (!url) return;
      window.api.shell.openExternal(url);
      return;
    }
    case "none":
    default:
      return;
  }
}

export default function ButtonView({
  component,
  data,
  sequence,
}: {
  component: ButtonComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  const { label, fontSize, color, backgroundColor, borderRadius, strokeColor, strokeWidth } = component.props;
  const disabled = !sequence;

  function handleClick() {
    if (!sequence) return;
    const confirmMessage = CONFIRM_MESSAGES[component.props.action];
    if (confirmMessage) {
      sequence.requestConfirm(confirmMessage, () => runAction(component, sequence, data));
      return;
    }
    runAction(component, sequence, data);
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
