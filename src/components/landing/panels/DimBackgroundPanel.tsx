import { DimBackgroundProps } from "@/lib/landing/types";

interface DimBackgroundPanelProps {
  props: DimBackgroundProps;
  onChange: (patch: Partial<DimBackgroundProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

// Component hiệu ứng — cùng nguyên tắc với FireworksPanel.tsx/StageLightPanel.tsx: chỉ cấu hình bản
// thân lớp phủ, không có phần trigger/Play-Stop ở đây (wiring nằm ở Trigger Graph, xem
// TriggerLinkPanel.tsx). Vị trí/kích thước (x/y/width/height) dùng chung SharedFields.tsx như mọi
// component khác — mặc định phủ cả khung 1920x1080 nhưng có thể kéo nhỏ lại nếu chỉ muốn dim 1 vùng.
export default function DimBackgroundPanel({ props, onChange }: DimBackgroundPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Color</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Target opacity (0-1)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            className={fieldClass}
            value={props.targetOpacity}
            onChange={(e) => onChange({ targetOpacity: Math.min(1, Math.max(0, Number(e.target.value))) })}
          />
        </div>
        <div>
          <label className={labelClass}>Fade duration (ms)</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.fadeDurationMs}
            onChange={(e) => onChange({ fadeDurationMs: Math.max(0, Number(e.target.value)) })}
          />
        </div>
      </div>
    </div>
  );
}
