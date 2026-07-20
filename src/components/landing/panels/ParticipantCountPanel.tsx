import { ParticipantCountProps } from "@/lib/landing/types";

interface ParticipantCountPanelProps {
  props: ParticipantCountProps;
  onChange: (patch: Partial<ParticipantCountProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

export default function ParticipantCountPanel({ props, onChange }: ParticipantCountPanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Label</label>
        <input className={fieldClass} value={props.label} onChange={(e) => onChange({ label: e.target.value })} />
      </div>
      <div>
        <label className={labelClass}>Count</label>
        <select
          className={fieldClass}
          value={props.mode}
          onChange={(e) => onChange({ mode: e.target.value as ParticipantCountProps["mode"] })}
        >
          <option value="total">Total participants</option>
          <option value="remainingEligible">Not yet won (approximate)</option>
        </select>
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
        <div className="col-span-2">
          <label className={labelClass}>Align</label>
          <select
            className={fieldClass}
            value={props.align}
            onChange={(e) => onChange({ align: e.target.value as ParticipantCountProps["align"] })}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>
    </div>
  );
}
