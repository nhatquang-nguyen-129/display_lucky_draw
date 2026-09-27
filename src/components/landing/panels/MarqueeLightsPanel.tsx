import { MarqueeLightsProps, MarqueePattern } from "@/lib/landing/types";
import ColorField from "./ColorField";
import DrawCycleFields from "./DrawCycleFields";

interface MarqueeLightsPanelProps {
  props: MarqueeLightsProps;
  onChange: (patch: Partial<MarqueeLightsProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

const MAX_COLORS = 6;

// Cùng khuôn FireworksPanel.tsx/ConfettiPanel.tsx: "Basic options" + "Interactions with Draw"
// (DrawCycleFields.tsx, Appear/Disappear).
export default function MarqueeLightsPanel({ props, onChange }: MarqueeLightsPanelProps) {
  function setColor(index: number, hex: string) {
    onChange({ colors: props.colors.map((c, i) => (i === index ? hex : c)) });
  }

  return (
    <div className="space-y-3">
      <span className={groupLabelClass}>Basic options</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Pattern</label>
          <select
            className={fieldClass}
            value={props.pattern}
            onChange={(e) => onChange({ pattern: e.target.value as MarqueePattern })}
          >
            <option value="chase">Chase</option>
            <option value="alternate">Alternate</option>
            <option value="twinkle">Twinkle</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Step (ms)</label>
          <input
            type="number"
            min={30}
            step={10}
            className={fieldClass}
            value={props.stepMs}
            onChange={(e) => onChange({ stepMs: Math.max(30, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Bulb size</label>
          <input
            type="number"
            min={2}
            className={fieldClass}
            value={props.bulbSize}
            onChange={(e) => onChange({ bulbSize: Math.max(2, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Spacing</label>
          <input
            type="number"
            min={8}
            className={fieldClass}
            value={props.spacing}
            onChange={(e) => onChange({ spacing: Math.max(8, Number(e.target.value)) })}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Corner radius</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.cornerRadius}
            onChange={(e) => onChange({ cornerRadius: Math.max(0, Number(e.target.value)) })}
          />
        </div>
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
