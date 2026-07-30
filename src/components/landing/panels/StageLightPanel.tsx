import { StageLightProps } from "@/lib/landing/types";

interface StageLightPanelProps {
  props: StageLightProps;
  onChange: (patch: Partial<StageLightProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const sectionClass = "text-[10px] uppercase tracking-wide text-base-500";

// Component hiệu ứng — cùng nguyên tắc với FireworksPanel.tsx: chỉ cấu hình bản thân đèn, không có
// phần trigger/Play-Stop ở đây (wiring nằm ở Trigger Graph, xem TriggerLinkPanel.tsx). Vị trí
// đặt đèn (x/y/width/height) dùng chung SharedFields.tsx như mọi component khác — đây là khung
// "gốc đèn", chùm sáng vẽ toả ra từ top-center của khung này (xem StageLightView.tsx).
export default function StageLightPanel({ props, onChange }: StageLightPanelProps) {
  return (
    <div className="space-y-3">
      <span className={sectionClass}>Beam</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Color</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.beamColor}
            onChange={(e) => onChange({ beamColor: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Opacity (0-1)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            className={fieldClass}
            value={props.beamOpacity}
            onChange={(e) => onChange({ beamOpacity: Math.min(1, Math.max(0, Number(e.target.value))) })}
          />
        </div>
        <div>
          <label className={labelClass}>Width (px)</label>
          <input
            type="number"
            min={1}
            className={fieldClass}
            value={props.beamWidth}
            onChange={(e) => onChange({ beamWidth: Math.max(1, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Length (px)</label>
          <input
            type="number"
            min={1}
            className={fieldClass}
            value={props.beamLength}
            onChange={(e) => onChange({ beamLength: Math.max(1, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Blur (px)</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.blurAmount}
            onChange={(e) => onChange({ blurAmount: Math.max(0, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Intensity (0-1)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            className={fieldClass}
            value={props.intensity}
            onChange={(e) => onChange({ intensity: Math.min(1, Math.max(0, Number(e.target.value))) })}
          />
        </div>
      </div>

      <div className="h-px bg-base-800" />
      <span className={sectionClass}>Sweep</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Center angle (deg, 0=down)</label>
          <input
            type="number"
            className={fieldClass}
            value={props.sweepAngle}
            onChange={(e) => onChange({ sweepAngle: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Swing range (deg)</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.swingRange}
            onChange={(e) => onChange({ swingRange: Math.max(0, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Sweep speed (sec/cycle)</label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            className={fieldClass}
            value={props.sweepSpeed}
            onChange={(e) => onChange({ sweepSpeed: Math.max(0.1, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Duration (ms, loop off)</label>
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
        Loop (keep sweeping until Stop)
      </label>

      <p className="text-[10px] leading-snug text-base-500">
        Idle by default — wire a link in the Trigger Graph (Button/Winner Name → Play → this
        component) to make it sweep during Present Mode. The Builder shows a static beam frozen at
        the center angle.
      </p>
    </div>
  );
}
