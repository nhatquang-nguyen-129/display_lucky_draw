import { FireworksProps } from "@/lib/landing/types";

interface FireworksPanelProps {
  props: FireworksProps;
  onChange: (patch: Partial<FireworksProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const sectionClass = "text-[10px] uppercase tracking-wide text-base-500";

const PRESET_LABELS: Record<FireworksProps["preset"], string> = {
  burstCenter: "Single burst (center)",
  rain: "Continuous show",
  cannons: "Twin cannons (2 corners)",
};
const PALETTE_LABELS: Record<FireworksProps["colorPalette"], string> = {
  brand: "Brand colors",
  gold: "Gold",
  rainbow: "Rainbow",
};

// Component hiệu ứng — không có phần trigger/Play-Stop nào ở đây, wiring khi nào Play/Stop nằm hoàn
// toàn trên Trigger Graph (xem TriggerLinkPanel.tsx). Panel này chỉ cấu hình BẢN THÂN hiệu
// ứng, giống hệt mọi component khác.
export default function FireworksPanel({ props, onChange }: FireworksPanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Preset</label>
        <select
          className={fieldClass}
          value={props.preset}
          onChange={(e) => onChange({ preset: e.target.value as FireworksProps["preset"] })}
        >
          {(Object.keys(PRESET_LABELS) as FireworksProps["preset"][]).map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Particle count</label>
          <input
            type="number"
            min={1}
            className={fieldClass}
            value={props.particleCount}
            onChange={(e) => onChange({ particleCount: Math.max(1, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Colors</label>
          <select
            className={fieldClass}
            value={props.colorPalette}
            onChange={(e) => onChange({ colorPalette: e.target.value as FireworksProps["colorPalette"] })}
          >
            {(Object.keys(PALETTE_LABELS) as FireworksProps["colorPalette"][]).map((p) => (
              <option key={p} value={p}>
                {PALETTE_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="h-px bg-base-800" />
      <span className={sectionClass}>Launch</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Direction (deg)</label>
          <input
            type="number"
            className={fieldClass}
            value={props.launchDirection}
            onChange={(e) => onChange({ launchDirection: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Launch height (%)</label>
          <input
            type="number"
            min={5}
            max={100}
            className={fieldClass}
            value={Math.round(props.launchHeight * 100)}
            onChange={(e) => onChange({ launchHeight: Math.min(1, Math.max(0.05, Number(e.target.value) / 100)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Spread angle (deg)</label>
          <input
            type="number"
            min={0}
            max={360}
            className={fieldClass}
            value={props.spreadAngle}
            onChange={(e) => onChange({ spreadAngle: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Burst radius</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.burstRadius}
            onChange={(e) => onChange({ burstRadius: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Speed</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.speed}
            onChange={(e) => onChange({ speed: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Gravity</label>
          <input
            type="number"
            className={fieldClass}
            value={props.gravity}
            onChange={(e) => onChange({ gravity: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Duration (ms)</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.duration}
            onChange={(e) => onChange({ duration: Math.max(0, Number(e.target.value)) })}
          />
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-base-200">
        <input
          type="checkbox"
          checked={props.loop}
          onChange={(e) => onChange({ loop: e.target.checked })}
          className="accent-gold-500"
        />
        Loop (fire again automatically after each burst)
      </label>
    </div>
  );
}
