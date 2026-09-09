import { useState } from "react";
import { LiveTextProps, WINNER_TRANSITION_EFFECTS, WinnerTransitionEffect } from "@/lib/landing/types";

interface LiveTextPanelProps {
  props: LiveTextProps & { appearEffect?: WinnerTransitionEffect; disappearEffect?: WinnerTransitionEffect; quickDrawText?: string };
  onChange: (patch: Record<string, any>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";
const detailsClass = "rounded-lg border border-base-800";
const summaryClass = "cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-base-100";
const detailsBodyClass = "space-y-3 border-t border-base-800 px-2.5 pb-2.5 pt-2.5";

// Cùng khuôn "Basic options" phẳng + "Interactions with Draw" đã dùng cho các panel khác — KHÔNG có
// "Self Interactions" (Winner Name không bị click/hover/select trực tiếp, mọi thứ nó làm đều VÌ Draw
// đã chạy). Không còn "Fallback text" — lúc Idle component ẩn hẳn (nội dung rỗng), thay bằng đúng 1
// cặp Appear/Disappear:
//   - "When Revealed" (Appear effect — đúng khoảnh khắc tên thật xuất hiện)
//   - "When Idle" (Disappear effect — đúng khoảnh khắc quay lại rỗng, Reset hoặc 1 lượt Draw mới vừa
//     bắt đầu)
//   - "When Quick Draw" (Quick Draw text — hiện thay tên khi 1 Quick Draw vừa chạy xong)
export default function LiveTextPanel({ props, onChange }: LiveTextPanelProps) {
  const [revealedOpen, setRevealedOpen] = useState(true);
  const [idleOpen, setIdleOpen] = useState(true);
  const [quickDrawOpen, setQuickDrawOpen] = useState(true);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>
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

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Interactions with Draw</span>
        <details open={revealedOpen} onToggle={(e) => setRevealedOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>When Revealed</summary>
          <div className={detailsBodyClass}>
            <div>
              <label className={labelClass}>Appear effect</label>
              <select
                className={fieldClass}
                value={props.appearEffect ?? "none"}
                onChange={(e) => onChange({ appearEffect: e.target.value as WinnerTransitionEffect })}
              >
                {WINNER_TRANSITION_EFFECTS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
        <details open={idleOpen} onToggle={(e) => setIdleOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>When Idle</summary>
          <div className={detailsBodyClass}>
            <div>
              <label className={labelClass}>Disappear effect</label>
              <select
                className={fieldClass}
                value={props.disappearEffect ?? "none"}
                onChange={(e) => onChange({ disappearEffect: e.target.value as WinnerTransitionEffect })}
              >
                {WINNER_TRANSITION_EFFECTS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
        <details open={quickDrawOpen} onToggle={(e) => setQuickDrawOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>When Quick Draw</summary>
          <div className={detailsBodyClass}>
            <div>
              <label className={labelClass}>Quick Draw text</label>
              <input
                className={fieldClass}
                value={props.quickDrawText ?? "Congratulations!"}
                onChange={(e) => onChange({ quickDrawText: e.target.value })}
              />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
