import { EFFECT_NAMES, EffectName, LiveTextProps, WINNER_TRANSITION_EFFECTS, WinnerTransitionEffect } from "@/lib/landing/types";

interface LiveTextPanelProps {
  props: LiveTextProps & { revealEffect?: EffectName; transitionEffect?: WinnerTransitionEffect; quickDrawText?: string };
  onChange: (patch: Record<string, any>) => void;
  // CHỈ true cho Winner Name — Prize Name dùng chung panel này nhưng KHÔNG có các field revealEffect/
  // transitionEffect/quickDrawText (xem WinnerNameProps trong types.ts để biết lý do), nên ẩn hẳn
  // phần này khi false thay vì hiện control không có tác dụng gì.
  showWinnerFields?: boolean;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

// Dùng chung cho winnerName + prizeName — 2 loại này chỉ khác nguồn dữ liệu (đọc trong view),
// còn cấu hình hiển thị hoàn toàn giống nhau (trừ revealEffect/transitionEffect, chỉ Winner Name có
// — xem trên).
export default function LiveTextPanel({ props, onChange, showWinnerFields }: LiveTextPanelProps) {
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

      {showWinnerFields && (
        <>
          <div>
            <label className={labelClass}>Quick Draw text</label>
            <input
              className={fieldClass}
              value={props.quickDrawText ?? "Congratulations!"}
              onChange={(e) => onChange({ quickDrawText: e.target.value })}
            />
            <p className="mt-1 text-[10px] leading-snug text-base-500">
              Shown instead of a winner's name right after a Quick Draw finishes on the Draw button —
              Quick Draw confirms many winners at once, so there's no single name left to show.
            </p>
          </div>

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
            <p className="mt-1 text-[10px] leading-snug text-base-500">
              Applies to whichever text is showing right now — including the fallback text while
              still waiting. Pick "pulse" or "bounce" to keep it moving the whole time.
            </p>
          </div>

          <div>
            <label className={labelClass}>Transition effect (fallback → winner name)</label>
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
            <p className="mt-1 text-[10px] leading-snug text-base-500">
              The swap itself — plays once, right at the moment the fallback text above is replaced
              by the real winner's name. "None" swaps instantly. Separate from Reveal effect above.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
