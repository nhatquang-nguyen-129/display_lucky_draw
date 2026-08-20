import { FireworkProps } from "@/lib/landing/types";
import { Prize } from "@/types";

interface FireworkPanelProps {
  props: FireworkProps;
  prizes: Prize[];
  onChange: (patch: Partial<FireworkProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

// Preset chỉ là NÚT TIỆN LỢI (điền nhanh color1/color2), không phải 1 field riêng lưu trong props —
// bấm xong người dùng vẫn chỉnh tay 2 màu bên dưới bình thường, không có khái niệm "đang ở preset nào".
const PRESETS: { label: string; color1: string; color2: string }[] = [
  { label: "Champagne", color1: "#F6D98B", color2: "#E8C66A" },
  { label: "Warm Gold", color1: "#E8C66A", color2: "#C9A85A" },
  { label: "Soft White", color1: "#F5F1E8", color2: "#DDD7C8" },
];

export default function FireworkPanel({ props, prizes, onChange }: FireworkPanelProps) {
  const mode = props.mode ?? "duration";
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Prize</label>
        <select className={fieldClass} value={props.prizeId ?? ""} onChange={(e) => onChange({ prizeId: e.target.value })}>
          <option value="">— none selected —</option>
          {prizes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-snug text-base-500">
          Fires within this box the instant this prize's winner is revealed — no need to hit Confirm
          first.
        </p>
      </div>

      <div className="h-px bg-base-800" />

      <div>
        <label className={labelClass}>Preset</label>
        <div className="flex gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ color1: p.color1, color2: p.color2 })}
              className="flex-1 rounded border border-base-700 bg-base-800 px-2 py-1 text-[10px] text-base-200 hover:border-gold-500"
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-base-500">
          Fills Color 1/2 below as a starting point — feel free to fine-tune them after.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Color 1 (trail, rays)</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.color1}
            onChange={(e) => onChange({ color1: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Color 2 (falling sparks)</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.color2}
            onChange={(e) => onChange({ color2: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Launch interval (ms)</label>
        <input
          type="number"
          min={400}
          step={100}
          className={fieldClass}
          value={props.intervalMs ?? 1200}
          onChange={(e) => onChange({ intervalMs: Number(e.target.value) })}
        />
        <p className="mt-1 text-[10px] leading-snug text-base-500">
          Average gap between one firework and the next while active (randomized a bit each time) —
          lower = more frequent.
        </p>
      </div>

      <div className="h-px bg-base-800" />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Delay (ms)</label>
          <input
            type="number"
            min={0}
            step={100}
            className={fieldClass}
            value={props.delayMs ?? 0}
            onChange={(e) => onChange({ delayMs: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Mode</label>
          <select className={fieldClass} value={mode} onChange={(e) => onChange({ mode: e.target.value as FireworkProps["mode"] })}>
            <option value="duration">Duration</option>
            <option value="continuous">Continuous</option>
          </select>
        </div>
      </div>
      {mode === "duration" ? (
        <div>
          <label className={labelClass}>Duration (ms)</label>
          <input
            type="number"
            min={200}
            step={100}
            className={fieldClass}
            value={props.durationMs ?? 4000}
            onChange={(e) => onChange({ durationMs: Number(e.target.value) })}
          />
          <p className="mt-1 text-[10px] leading-snug text-base-500">Fires for this long (after the delay above), then stops.</p>
        </div>
      ) : (
        <p className="text-[10px] leading-snug text-base-500">
          Keeps firing (after the delay above) until the next draw of any kind starts.
        </p>
      )}
    </div>
  );
}
