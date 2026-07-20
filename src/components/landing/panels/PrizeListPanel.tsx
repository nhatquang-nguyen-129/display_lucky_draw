import { PrizeListProps } from "@/lib/landing/types";

interface PrizeListPanelProps {
  props: PrizeListProps;
  onChange: (patch: Partial<PrizeListProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

export default function PrizeListPanel({ props, onChange }: PrizeListPanelProps) {
  return (
    <div className="space-y-3">
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
      </div>
      <label className="flex items-center gap-1.5 text-xs text-base-200">
        <input
          type="checkbox"
          checked={props.showRemaining}
          onChange={(e) => onChange({ showRemaining: e.target.checked })}
          className="accent-gold-500"
        />
        Show remaining / quantity
      </label>
    </div>
  );
}
