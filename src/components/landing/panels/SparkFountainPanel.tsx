import { SparkFountainProps } from "@/lib/landing/types";
import ColorField from "./ColorField";
import DrawCycleFields from "./DrawCycleFields";

interface SparkFountainPanelProps {
  props: SparkFountainProps;
  onChange: (patch: Partial<SparkFountainProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

const MAX_COLORS = 6;

// Cùng khuôn ConfettiPanel.tsx: "Basic options" + "Interactions with Draw" (DrawCycleFields.tsx,
// Appear/Disappear + Prize). Duration chỉ hiện khi Play = Once.
export default function SparkFountainPanel({ props, onChange }: SparkFountainPanelProps) {
  function setColor(index: number, hex: string) {
    onChange({ colors: props.colors.map((c, i) => (i === index ? hex : c)) });
  }

  return (
    <div className="space-y-3">
      <span className={groupLabelClass}>Basic options</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Fountains</label>
          <input
            type="number"
            min={1}
            max={8}
            className={fieldClass}
            value={props.fountainCount}
            onChange={(e) => onChange({ fountainCount: Math.max(1, Math.min(8, Number(e.target.value))) })}
          />
        </div>
        <div>
          <label className={labelClass}>Intensity</label>
          <input
            type="number"
            min={10}
            max={1000}
            step={10}
            className={fieldClass}
            value={props.intensity}
            onChange={(e) => onChange({ intensity: Math.max(10, Math.min(1000, Number(e.target.value))) })}
          />
        </div>
        <div>
          <label className={labelClass}>Play</label>
          <select
            className={fieldClass}
            value={props.playMode}
            onChange={(e) => onChange({ playMode: e.target.value as SparkFountainProps["playMode"] })}
          >
            <option value="continuous">Continuous</option>
            <option value="once">Once</option>
          </select>
        </div>
        {props.playMode === "once" && (
          <div>
            <label className={labelClass}>Duration (ms)</label>
            <input
              type="number"
              min={200}
              step={500}
              className={fieldClass}
              value={props.durationMs}
              onChange={(e) => onChange({ durationMs: Math.max(200, Number(e.target.value)) })}
            />
          </div>
        )}
      </div>
      <div>
        <label className={labelClass}>Height ({props.height}%)</label>
        <input
          type="range"
          min={10}
          max={100}
          className="w-full accent-gold-500"
          value={props.height}
          onChange={(e) => onChange({ height: Number(e.target.value) })}
        />
      </div>
      <div>
        <label className={labelClass}>Spread ({props.spread}°)</label>
        <input
          type="range"
          min={0}
          max={45}
          className="w-full accent-gold-500"
          value={props.spread}
          onChange={(e) => onChange({ spread: Number(e.target.value) })}
        />
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
