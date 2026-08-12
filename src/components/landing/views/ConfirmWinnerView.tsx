import { ConfirmWinnerComponent, DrawSequenceActions } from "@/lib/landing/types";
import { useTriggerCommands } from "../useTriggerCommands";

function ConfirmWinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  );
}

// Receiver thuần — tái tạo Button action "confirm" cũ (xem comment ở ConfirmWinnerComponent trong
// types.ts). Không cần ngoại lệ hẹp — confirm() ghi DB xong là kết thúc, không có gì để nối chuỗi
// tiếp theo dựa vào. confirm() đã tự no-op nếu chưa có candidate đang chờ hoặc đang busy, nên không
// cần thêm điều kiện gì ở đây — giữ đúng triết lý "Receiver tự no-op im lặng".
export default function ConfirmWinnerView({
  component,
  sequence,
}: {
  component: ConfirmWinnerComponent;
  sequence?: DrawSequenceActions;
}) {
  useTriggerCommands(component.triggerActions, sequence, (command) => {
    if (command === "ConfirmWinner.Confirm") sequence?.confirm();
  });

  if (!sequence) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold-300/60 bg-gold-500 text-[11px] font-medium text-white shadow-md">
        <ConfirmWinnerIcon />
        Confirm Winner
      </div>
    );
  }

  return null;
}
