import { DrawComponent, DrawSequenceActions } from "@/lib/landing/types";
import { useTriggerCommands } from "../useTriggerCommands";

function DrawIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" />
    </svg>
  );
}

// Receiver thuần — tái tạo Button action "draw" cũ (xem comment ở DrawComponent trong types.ts).
// Ngoại lệ hẹp giống Lucky Wheel: pick() là IPC bất đồng bộ, chỉ bắn "Draw.Picked" SAU KHI pick()
// thật sự thành công — nhờ vậy Wheel.StartSpin (nếu nối từ đây) luôn đọc đúng candidate vừa chọn,
// không phải candidate cũ do bắn tín hiệu quá sớm.
export default function DrawView({
  component,
  sequence,
}: {
  component: DrawComponent;
  sequence?: DrawSequenceActions;
}) {
  useTriggerCommands(component.triggerActions, sequence, (command) => {
    if (command !== "Draw.Pick") return;
    sequence
      ?.pick()
      .then(() => sequence.fireClick(component.id))
      .catch(() => {
        // pick() thất bại (hết participant/prize, lỗi IPC...) — sequence.error đã có sẵn để hiện,
        // KHÔNG bắn "Draw.Picked" vì chưa thật sự có candidate mới nào cho Wheel đọc.
      });
  });

  if (!sequence) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-base-700 text-[11px] text-base-500">
        <DrawIcon />
        Draw
      </div>
    );
  }

  return null;
}
