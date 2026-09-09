import { useState } from "react";
import { TextProps, WINNER_TRANSITION_EFFECTS, WinnerTransitionEffect } from "@/lib/landing/types";

interface TextPanelProps {
  props: TextProps;
  onChange: (patch: Partial<TextProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";
const detailsClass = "rounded-lg border border-base-800";
const summaryClass = "cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-base-100";
const detailsBodyClass = "space-y-3 border-t border-base-800 px-2.5 pb-2.5 pt-2.5";

// 1 nhóm "Basic options" phẳng + "Interactions with Draw" — cùng khuôn Winner Name dùng (xem
// LiveTextPanel.tsx). KHÔNG có "Self Interactions" (Text không bị click/hover/select trực tiếp).
// "Interactions with Draw" mặc định TẮT (checkbox "Sync with Draw") — Text vẫn TĨNH/luôn hiện như cũ
// trừ khi người dùng CHỦ ĐỘNG bật, giữ nguyên hành vi mọi landing đã lưu trước khi có tính năng này
// (xem TextView.tsx). Bật lên thì ẩn hẳn lúc Idle, chỉ hiện khi Draw vừa tiết lộ 1 kết quả — cùng
// Appear/Disappear effect với Winner Name.
export default function TextPanel({ props, onChange }: TextPanelProps) {
  const [revealedOpen, setRevealedOpen] = useState(true);
  const [idleOpen, setIdleOpen] = useState(true);

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

      <div className="space-y-2">
        <span className={groupLabelClass}>Interactions with Draw</span>
        <label className="flex items-center gap-1.5 text-xs text-base-200">
          <input
            type="checkbox"
            checked={!!props.syncWithDraw}
            onChange={(e) => onChange({ syncWithDraw: e.target.checked })}
            className="accent-gold-500"
          />
          Sync with Draw (hidden until a winner is revealed)
        </label>
        {props.syncWithDraw && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
