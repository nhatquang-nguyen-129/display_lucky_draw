import { useState } from "react";
import { EFFECT_NAMES, EffectName, LiveTextProps, WINNER_TRANSITION_EFFECTS, WinnerTransitionEffect } from "@/lib/landing/types";

interface LiveTextPanelProps {
  props: LiveTextProps & { revealEffect?: EffectName; transitionEffect?: WinnerTransitionEffect; quickDrawText?: string };
  onChange: (patch: Record<string, any>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";
const detailsClass = "rounded-lg border border-base-800";
const summaryClass = "cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-base-100";
const detailsBodyClass = "space-y-3 border-t border-base-800 px-2.5 pb-2.5 pt-2.5";

// Cùng khuôn "Basic options" phẳng + nhóm "Self Interactions"/"Interactions with Draw" 2 cấp, đặt tên
// "When..." đã dùng cho LiveImagePanel.tsx/LuckyWheelPanel.tsx — Self Interactions LUÔN đứng TRƯỚC
// Interactions with Draw (tự thân component trước, phản ứng theo sự kiện ngoài sau):
//   - "Self Interactions" → "When Idle" (Reveal effect — hiệu ứng đứng yên áp cho BẤT KỲ đoạn text nào
//     đang hiện, kể cả fallback lúc còn chờ, không phụ thuộc đã có kết quả Draw hay chưa).
//   - "Interactions with Draw" → "When Revealed" (Transition effect — đúng khoảnh khắc fallback đổi
//     thành tên thật) và "When Quick Draw" (Quick Draw text — hiện thay tên khi 1 Quick Draw vừa
//     chạy xong) — cả 2 đều CHỈ xảy ra vì Draw đã chạy.
export default function LiveTextPanel({ props, onChange }: LiveTextPanelProps) {
  const [idleOpen, setIdleOpen] = useState(true);
  const [revealedOpen, setRevealedOpen] = useState(true);
  const [quickDrawOpen, setQuickDrawOpen] = useState(true);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>
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

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Self Interactions</span>
        <details open={idleOpen} onToggle={(e) => setIdleOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>When Idle</summary>
          <div className={detailsBodyClass}>
            <div>
              <label className={labelClass}>Reveal effect</label>
              <select
                className={fieldClass}
                value={props.revealEffect ?? "none"}
                onChange={(e) => onChange({ revealEffect: e.target.value as EffectName })}
              >
                {EFFECT_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
      </div>

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Interactions with Draw</span>
        <details open={revealedOpen} onToggle={(e) => setRevealedOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>When Revealed</summary>
          <div className={detailsBodyClass}>
            <div>
              <label className={labelClass}>Transition effect</label>
              <select
                className={fieldClass}
                value={props.transitionEffect ?? "none"}
                onChange={(e) => onChange({ transitionEffect: e.target.value as WinnerTransitionEffect })}
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
