import { TextProps } from "@/lib/landing/types";
import ColorField from "./ColorField";
import DrawCycleFields from "./DrawCycleFields";

interface TextPanelProps {
  props: TextProps;
  onChange: (patch: Partial<TextProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

// "Interactions with Draw" dùng chung DrawCycleFields.tsx với ImagePanel.tsx (xem doc-comment ở đó)
// — `content` là 1 chuỗi TĨNH do người dùng tự đặt, không đổi theo từng lượt quay, khác Winner Name
// (LiveTextPanel.tsx — tên người trúng đổi theo từng lượt, vẫn dùng `useRevealed` riêng). KHÔNG có
// "Self Interactions" (Text không bị click/hover/select trực tiếp).
export default function TextPanel({ props, onChange }: TextPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>
        <div>
          <label className={labelClass}>Content</label>
          <textarea
            className={`${fieldClass} h-20 resize-none`}
            value={props.content}
            onChange={(e) => onChange({ content: e.target.value })}
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
            <ColorField value={props.color} onChange={(color) => onChange({ color })} />
          </div>
          <div>
            <label className={labelClass}>Weight</label>
            <select
              className={fieldClass}
              value={props.fontWeight}
              onChange={(e) => onChange({ fontWeight: e.target.value as TextProps["fontWeight"] })}
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
              onChange={(e) => onChange({ align: e.target.value as TextProps["align"] })}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
        </div>
      </div>

      <div className="h-px bg-base-800" />

      <DrawCycleFields props={props} onChange={onChange} />
    </div>
  );
}
