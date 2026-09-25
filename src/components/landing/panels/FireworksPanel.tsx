import { FireworksLaunchFrom, FireworksProps } from "@/lib/landing/types";
import ColorField from "./ColorField";
import DrawCycleFields from "./DrawCycleFields";

interface FireworksPanelProps {
  props: FireworksProps;
  onChange: (patch: Partial<FireworksProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

const MAX_COLORS = 6;

// Cùng khuôn OrbitLightsPanel.tsx: "Basic options" + "Interactions with Draw" (DrawCycleFields.tsx,
// Appear/Disappear) — mặc định tắt, pháo hoa bắn liên tục ở Present Mode.
export default function FireworksPanel({ props, onChange }: FireworksPanelProps) {
  function setColor(index: number, hex: string) {
    onChange({ colors: props.colors.map((c, i) => (i === index ? hex : c)) });
  }

  return (
    <div className="space-y-3">
      <span className={groupLabelClass}>Basic options</span>
      <div>
        <label className={labelClass}>Launch from</label>
        <select
          className={fieldClass}
          value={props.launchFrom}
          onChange={(e) => onChange({ launchFrom: e.target.value as FireworksLaunchFrom })}
        >
          <option value="scattered">Scattered</option>
          <option value="center">Center</option>
          <option value="sides">Both sides</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Sparks per burst</label>
          <input
            type="number"
            min={6}
            max={400}
            className={fieldClass}
            value={props.sparkCount}
            onChange={(e) => onChange({ sparkCount: Math.max(6, Math.min(400, Number(e.target.value))) })}
          />
        </div>
        <div>
          <label className={labelClass}>Interval (ms)</label>
          <input
            type="number"
            min={150}
            step={100}
            className={fieldClass}
            value={props.launchIntervalMs}
            onChange={(e) => onChange({ launchIntervalMs: Math.max(150, Number(e.target.value)) })}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Burst size ({props.burstSize}%)</label>
        <input
          type="range"
          min={30}
          max={200}
          className="w-full accent-gold-500"
          value={props.burstSize}
          onChange={(e) => onChange({ burstSize: Number(e.target.value) })}
        />
      </div>
      <div>
        <label className={labelClass}>Launch height ({props.launchHeight}%)</label>
        <input
          type="range"
          min={10}
          max={95}
          className="w-full accent-gold-500"
          value={props.launchHeight}
          onChange={(e) => onChange({ launchHeight: Number(e.target.value) })}
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
