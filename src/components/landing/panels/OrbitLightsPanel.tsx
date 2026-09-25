import { orbitLightColor, OrbitLightsProps } from "@/lib/landing/types";
import ColorField from "./ColorField";
import DrawCycleFields from "./DrawCycleFields";

interface OrbitLightsPanelProps {
  props: OrbitLightsProps;
  onChange: (patch: Partial<OrbitLightsProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

// "Basic options" + "Interactions with Draw" dùng chung DrawCycleFields.tsx y hệt ImagePanel.tsx
// (chỉ Appear/Disappear) — mặc định tắt, hiệu ứng luôn hiện + chạy liên tục ở Present Mode.
export default function OrbitLightsPanel({ props, onChange }: OrbitLightsPanelProps) {
  const count = Math.max(1, Math.min(6, Math.round(props.particleCount)));

  // Ghi ĐỦ mảng tới hạt đang sửa (điền màu đang hiển thị cho các ô trống phía trước) — tránh mảng
  // thưa có lỗ `undefined` khi lưu JSON.
  function setColor(index: number, hex: string) {
    const colors = Array.from({ length: Math.max(index + 1, props.colors?.length ?? 0) }, (_, i) =>
      i === index ? hex : orbitLightColor(props, i)
    );
    onChange({ colors });
  }

  return (
    <div className="space-y-3">
      <span className={groupLabelClass}>Basic options</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Particles</label>
          <input
            type="number"
            min={1}
            max={6}
            className={fieldClass}
            value={props.particleCount}
            onChange={(e) => onChange({ particleCount: Math.max(1, Math.min(6, Number(e.target.value))) })}
          />
        </div>
        <div>
          <label className={labelClass}>Particle size</label>
          <input
            type="number"
            min={1}
            className={fieldClass}
            value={props.particleSize}
            onChange={(e) => onChange({ particleSize: Math.max(1, Number(e.target.value)) })}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Lap time (ms)</label>
          <input
            type="number"
            min={500}
            step={500}
            className={fieldClass}
            value={props.revolutionMs}
            onChange={(e) => onChange({ revolutionMs: Math.max(500, Number(e.target.value)) })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>
            <label className={labelClass}>Color {i + 1}</label>
            <ColorField value={orbitLightColor(props, i)} onChange={(hex) => setColor(i, hex)} />
          </div>
        ))}
      </div>
      <div>
        <label className={labelClass}>Trail length ({props.trailLength}%)</label>
        <input
          type="range"
          min={0}
          max={60}
          className="w-full accent-gold-500"
          value={props.trailLength}
          onChange={(e) => onChange({ trailLength: Number(e.target.value) })}
        />
      </div>
      <div>
        <label className={labelClass}>Orbit width ({props.orbitWidth}%)</label>
        <input
          type="range"
          min={10}
          max={100}
          className="w-full accent-gold-500"
          value={props.orbitWidth}
          onChange={(e) => onChange({ orbitWidth: Number(e.target.value) })}
        />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-base-200">
        <input
          type="checkbox"
          checked={props.showOrbits}
          onChange={(e) => onChange({ showOrbits: e.target.checked })}
          className="accent-gold-500"
        />
        Show orbit paths
      </label>

      <div className="h-px bg-base-800" />

      <DrawCycleFields props={props} onChange={onChange} />
    </div>
  );
}
