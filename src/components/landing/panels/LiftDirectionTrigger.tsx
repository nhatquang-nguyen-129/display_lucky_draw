// Điều khiển "kéo mũi tên Direction quanh 1 điểm CỐ ĐỊNH chính giữa khung" cho hiệu ứng Lift — song
// song với ScaleAnchorTrigger.tsx (Scale Up) nhưng ĐƠN GIẢN HƠN: không có bước "thả điểm neo" (điểm cố
// định của Lift LUÔN có sẵn, chính giữa khung theo rectangle vòng ngoài, không bám pixel, không đặt
// được — xem doc-comment PrizeGroupEffect trong types.ts), nên KHÔNG có mode "placing", bấm Edit là vào
// thẳng "editing". "Đã cấu hình chưa" suy trực tiếp từ toạ độ (lệch khỏi tâm 50/50 = đã kéo), không cần
// field boolean riêng như `anchorPlaced` của Scale Up.
export default function LiftDirectionTrigger({
  configured,
  mode,
  onStartEditing,
  onDone,
  onReset,
}: {
  configured: boolean;
  mode: "placing" | "editing" | "locked" | null;
  onStartEditing: () => void;
  onDone: () => void;
  onReset: () => void;
}) {
  if (mode === "editing") {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded border border-gold-500 bg-gold-500/10 px-2 py-1.5 text-xs font-medium text-gold-500 transition-colors"
        >
          Done — stop editing on canvas
        </button>
        <p className="text-[10px] leading-snug text-base-500">
          Drag the yellow arrow away from the fixed center point to set how far (and toward where) it lifts.
        </p>
      </div>
    );
  }

  if (configured) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onStartEditing}
            className="flex-1 rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs font-medium text-base-200 transition-colors hover:border-gold-500/50"
          >
            Edit direction
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded border border-danger-500/40 bg-danger-500/10 px-2 py-1.5 text-xs font-medium text-danger-500 transition-colors hover:bg-danger-500/20"
          >
            Reset
          </button>
        </div>
        <p className="text-[10px] leading-snug text-base-500">Direction arrow shown on the canvas. Reset to lift evenly in place.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onStartEditing}
        className="w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs font-medium text-base-200 transition-colors hover:border-gold-500/50"
      >
        Edit direction on canvas
      </button>
      <p className="text-[10px] leading-snug text-base-500">No direction set yet — nothing moves until you drag the arrow.</p>
    </div>
  );
}
