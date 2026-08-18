// Điều khiển "thả điểm neo + kéo mũi tên Direction NGAY TRÊN canvas" cho hiệu ứng Scale Up — thay hẳn
// dial tròn trừu tượng cũ (đã bỏ hẳn, xem LiftDirectionTrigger.tsx cho phiên bản Lift tương tự) VÀ ô
// nhập số "Zoom amount" cũ. Chỉ CÓ DUY NHẤT 1 Anchor/Direction tại 1 thời điểm (xem doc-comment
// AnchorEditTarget/PrizeGroupEffect trong types.ts) — `anchorPlaced` (đã lưu, tồn tại QUA CẢ lúc
// đóng/mở lại Builder) mới là nguồn sự thật cho "đã thả hay chưa", `mode` chỉ mô tả trạng thái TƯƠNG
// TÁC tức thời trên canvas ngay lúc này (null = không phải stage đang được canvas theo dõi lúc này,
// dù `anchorPlaced` có thể vẫn true).
//
//   !anchorPlaced            → 1 nút "Drop anchor point on canvas".
//   anchorPlaced, mode!="editing" → 2 nút "Edit anchor & direction" + "Remove" (Anchor vẫn HIỆN trên
//                                    canvas ở mode "locked", xem ScaleAnchorOverlay.tsx — không biến
//                                    mất chỉ vì không còn tương tác, tránh bối rối "đã kéo hay chưa").
//   mode === "editing"        → 1 nút "Done — stop editing on canvas".
export default function ScaleAnchorTrigger({
  x,
  y,
  anchorPlaced,
  mode,
  onStartEditing,
  onDone,
  onRemove,
}: {
  x: number;
  y: number;
  anchorPlaced: boolean;
  mode: "placing" | "editing" | "locked" | null;
  onStartEditing: () => void;
  onDone: () => void;
  onRemove: () => void;
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
          Drag the yellow Direction arrow to set how far (and toward where) it zooms — the Anchor pin is fixed now.
        </p>
      </div>
    );
  }

  if (mode === "placing") {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          disabled
          className="w-full cursor-default rounded border border-gold-500 bg-gold-500/10 px-2 py-1.5 text-xs font-medium text-gold-500"
        >
          Click the prize on the canvas to drop it…
        </button>
        <p className="text-[10px] leading-snug text-base-500">
          Click anywhere on the prize image in the canvas — the anchor snaps to the nearest visible pixel.
        </p>
      </div>
    );
  }

  if (anchorPlaced) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onStartEditing}
            className="flex-1 rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs font-medium text-base-200 transition-colors hover:border-gold-500/50"
          >
            Edit anchor &amp; direction
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-danger-500/40 bg-danger-500/10 px-2 py-1.5 text-xs font-medium text-danger-500 transition-colors hover:bg-danger-500/20"
          >
            Remove
          </button>
        </div>
        <p className="text-[10px] leading-snug text-base-500">
          Anchor at {Math.round(x)}%, {Math.round(y)}% — shown on the canvas. Remove to start over.
        </p>
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
        Drop anchor point on canvas
      </button>
      <p className="text-[10px] leading-snug text-base-500">No anchor yet — zoom grows evenly from the middle until you drop one.</p>
    </div>
  );
}
