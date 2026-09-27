import { BackgroundProps, DEFAULT_BACKGROUND_DIM_AMOUNT, DrawCycleConfig } from "@/lib/landing/types";
import DrawCycleFields from "./DrawCycleFields";

interface BackgroundPanelProps {
  props: BackgroundProps;
  onChange: (patch: Partial<BackgroundProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

// Bộ mặc định lúc bật "Trigger with Draw" lần đầu — nền "sạch" lúc Idle, dim 80% lúc Draw (tôn Winner
// Name/Lucky Wheel nổi bật khi vừa quay xong), sạch lại lúc Redraw rồi tự dim lại theo drawEffect —
// cùng tinh thần "dim khi Reveal, sáng lại khi Draw tiếp" của tính năng dim nền cũ (đã gỡ khỏi
// Background Panel toàn cục, giờ chuyển hẳn vào đây qua DrawCycleFields.tsx dùng chung với Image/Text).
const DEFAULT_DRAW_CYCLE_ON: DrawCycleConfig = {
  idleState: "disappear",
  drawAction: "dim",
  drawEffect: { effect: "crossfade", amount: DEFAULT_BACKGROUND_DIM_AMOUNT },
  redrawAction: "disappear",
  redrawEffect: { effect: "crossfade" },
};

// Panel của component Background:
//   - Basic options: y hệt Image (Image + Fit), trừ Border radius (bo góc không có ý nghĩa cho 1 lớp
//     phủ nền). Video sẽ thêm vào đây sau này (cùng field `srcDataUrl`, thêm loại file được accept) mà
//     không cần đổi kiến trúc.
//   - Self Interactions: CHƯA có mục nào cụ thể — để sẵn chỗ cho tính năng tương lai (vd phản ứng theo
//     hover/click của người vận hành trên chính Background), không có field nào ở đây cho tới lúc đó.
//   - Interactions with Draw: DÙNG CHUNG `DrawCycleFields.tsx` với Image/Text (KHÔNG viết riêng nữa) —
//     chỉ khác ở `allowedStates` truyền vào: Background cho chọn đủ 4 giá trị Appearance
//     (Appear/Disappear/Dim/Blur) thay vì 2, xem doc-comment DrawRestState trong types.ts.
export default function BackgroundPanel({ props, onChange }: BackgroundPanelProps) {
  function handleFile(file: File) {
    if (file.type !== "image/png" && file.type !== "image/jpeg") return;
    const reader = new FileReader();
    reader.onload = () => onChange({ srcDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>
        <div>
          <label className={labelClass}>Image (PNG, JPG)</label>
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="text-xs text-base-300"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {props.srcDataUrl && (
            <button
              onClick={() => onChange({ srcDataUrl: null })}
              className="mt-1 text-left text-[11px] text-danger-500 hover:underline"
            >
              Remove image
            </button>
          )}
        </div>
        <div>
          <label className={labelClass}>Fit</label>
          <select
            className={fieldClass}
            value={props.fit}
            onChange={(e) => onChange({ fit: e.target.value as BackgroundProps["fit"] })}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="stretch">Stretch</option>
          </select>
        </div>
      </div>

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Self Interactions</span>
        <p className="text-[11px] text-base-500">Nothing here yet — coming soon.</p>
      </div>

      <div className="h-px bg-base-800" />

      <DrawCycleFields
        props={props}
        onChange={onChange}
        allowedStates={["appear", "disappear", "dim", "blur"]}
        defaultCycleOn={DEFAULT_DRAW_CYCLE_ON}
      />
    </div>
  );
}
