import { ConfettiLaunchFrom, ConfettiProps } from "@/lib/landing/types";
import ColorField from "./ColorField";
import DrawCycleFields from "./DrawCycleFields";

interface ConfettiPanelProps {
  props: ConfettiProps;
  onChange: (patch: Partial<ConfettiProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

const MAX_COLORS = 6;

// Cùng khuôn FireworksPanel.tsx: "Basic options" + "Interactions with Draw" (DrawCycleFields.tsx,
// Appear/Disappear). Interval chỉ hiện khi Loop + bung từ dưới (Center/Both sides) — "Top" loop là
// rơi liên tục, không có khái niệm "đợt".
export default function ConfettiPanel({ props, onChange }: ConfettiPanelProps) {
  function setColor(index: number, hex: string) {
    onChange({ colors: props.colors.map((c, i) => (i === index ? hex : c)) });
  }

  const showInterval = props.playMode === "loop" && props.launchFrom !== "top";

  return (
    <div className="space-y-3">
      <span className={groupLabelClass}>Basic options</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Launch from</label>
          <select
            className={fieldClass}
            value={props.launchFrom}
            onChange={(e) => onChange({ launchFrom: e.target.value as ConfettiLaunchFrom })}
          >
            <option value="top">Top (rain)</option>
            <option value="center">Center</option>
            <option value="sides">Both sides</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Play</label>
          <select
            className={fieldClass}
            value={props.playMode}
            onChange={(e) => onChange({ playMode: e.target.value as ConfettiProps["playMode"] })}
          >
            <option value="once">Once</option>
            <option value="loop">Loop</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Pieces</label>
          <input
            type="number"
            min={10}
            max={600}
            className={fieldClass}
            value={props.pieceCount}
            onChange={(e) => onChange({ pieceCount: Math.max(10, Math.min(600, Number(e.target.value))) })}
          />
        </div>
        <div>
          <label className={labelClass}>Piece size</label>
          <input
            type="number"
            min={4}
            className={fieldClass}
            value={props.pieceSize}
            onChange={(e) => onChange({ pieceSize: Math.max(4, Number(e.target.value)) })}
          />
        </div>
        {showInterval && (
          <div className="col-span-2">
            <label className={labelClass}>Interval (ms)</label>
            <input
              type="number"
              min={500}
              step={500}
              className={fieldClass}
              value={props.intervalMs}
              onChange={(e) => onChange({ intervalMs: Math.max(500, Number(e.target.value)) })}
            />
          </div>
        )}
      </div>
      <div>
        <label className={labelClass}>Colors</label>
        <div className="grid grid-cols-2 gap-2">
          {props.colors.map((color, i) => (
            <div key={i} className="flex items-center gap-1">
              <ColorField value={color} onChange={(hex) => setColor(i, hex)} className="h-[26px] min-w-0 flex-1" />
              {props.colors.length > 1 && (
                <button
                  onClick={() => onChange({ colors: props.colors.filter((_, j) => j !== i) })}
                  className="shrink-0 px-1 text-xs text-base-500 hover:text-danger-500"
                  title="Remove color"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {props.colors.length < MAX_COLORS && (
          <button
            onClick={() => onChange({ colors: [...props.colors, "#FFFFFF"] })}
            className="mt-2 text-xs text-gold-500 hover:underline"
          >
            + Add color
          </button>
        )}
      </div>

      <div className="h-px bg-base-800" />

      <DrawCycleFields props={props} onChange={onChange} />
    </div>
  );
}
