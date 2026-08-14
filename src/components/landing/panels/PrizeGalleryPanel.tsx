import { PrizeGalleryProps } from "@/lib/landing/types";

interface PrizeGalleryPanelProps {
  props: PrizeGalleryProps;
  onChange: (patch: Partial<PrizeGalleryProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

export default function PrizeGalleryPanel({ props, onChange }: PrizeGalleryPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Columns</label>
          <input
            type="number"
            min={1}
            className={fieldClass}
            value={props.columns}
            onChange={(e) => onChange({ columns: Math.max(1, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Gap</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.gap}
            onChange={(e) => onChange({ gap: Math.max(0, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Image fit</label>
          <select
            className={fieldClass}
            value={props.imageFit}
            onChange={(e) => onChange({ imageFit: e.target.value as PrizeGalleryProps["imageFit"] })}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="stretch">Stretch</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Corner radius</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.borderRadius}
            onChange={(e) => onChange({ borderRadius: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Glow color</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.glowColor}
            onChange={(e) => onChange({ glowColor: e.target.value })}
          />
        </div>
      </div>

      <div className="h-px bg-base-800" />

      <label className="flex items-center gap-1.5 text-xs text-base-200">
        <input
          type="checkbox"
          checked={props.showName}
          onChange={(e) => onChange({ showName: e.target.checked })}
          className="accent-gold-500"
        />
        Show prize name
      </label>

      {props.showName && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Name font size</label>
            <input
              type="number"
              className={fieldClass}
              value={props.nameFontSize}
              onChange={(e) => onChange({ nameFontSize: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Name color</label>
            <input
              type="color"
              className="h-[26px] w-full rounded border border-base-700 bg-base-800"
              value={props.nameColor}
              onChange={(e) => onChange({ nameColor: e.target.value })}
            />
          </div>
        </div>
      )}

      <p className="text-[10px] leading-snug text-base-500">
        Present Mode only: hover a prize for a light preview glow, click to select it — glows strong
        and zooms in ~10%, stays that way until you click again or pick a different prize. The next
        Draw picks a winner for that prize specifically. Out-of-stock prizes dim down automatically
        and can't be selected.
      </p>
    </div>
  );
}
