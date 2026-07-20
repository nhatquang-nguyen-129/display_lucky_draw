import { LiveTextProps } from "@/lib/landing/types";

interface LiveTextPanelProps {
  props: LiveTextProps;
  onChange: (patch: Partial<LiveTextProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

// Dùng chung cho winnerName + prizeName — 2 loại này chỉ khác nguồn dữ liệu (đọc trong view),
// còn cấu hình hiển thị hoàn toàn giống nhau.
export default function LiveTextPanel({ props, onChange }: LiveTextPanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Fallback text (before the first draw)</label>
        <input
          className={fieldClass}
          value={props.fallbackText}
          onChange={(e) => onChange({ fallbackText: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Font size</label>
          <input
            type="number"
            className={fieldClass}
            value={props.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          />
        </div>
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
          <label className={labelClass}>Weight</label>
          <select
            className={fieldClass}
            value={props.fontWeight}
            onChange={(e) => onChange({ fontWeight: e.target.value as LiveTextProps["fontWeight"] })}
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Align</label>
          <select
            className={fieldClass}
            value={props.align}
            onChange={(e) => onChange({ align: e.target.value as LiveTextProps["align"] })}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>
    </div>
  );
}
