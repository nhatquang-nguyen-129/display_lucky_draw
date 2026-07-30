import { ParticipantCountProps } from "@/lib/landing/types";

interface ParticipantCountPanelProps {
  props: ParticipantCountProps;
  onChange: (patch: Partial<ParticipantCountProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const sectionClass = "text-[10px] uppercase tracking-wide text-base-500";

const FONT_OPTIONS = [
  { value: "Inter, ui-sans-serif, sans-serif", label: "Sans (default)" },
  { value: "Georgia, serif", label: "Serif" },
  { value: "'Courier New', monospace", label: "Monospace" },
];

// Config cũ (trước khi tách Label/Count) chỉ có fontSize/color dùng chung — fallback đọc lại field
// đó nếu field mới chưa có (landing đã lưu từ trước), xem comment ở types.ts.
function legacyStyle(props: ParticipantCountProps) {
  return props as unknown as { fontSize?: number; color?: string };
}

export default function ParticipantCountPanel({ props, onChange }: ParticipantCountPanelProps) {
  const legacy = legacyStyle(props);
  const labelFontFamily = props.labelFontFamily ?? FONT_OPTIONS[0].value;
  const labelFontSize = props.labelFontSize ?? legacy.fontSize ?? 24;
  const labelColor = props.labelColor ?? legacy.color ?? "#FFFFFF";
  const countFontFamily = props.countFontFamily ?? FONT_OPTIONS[0].value;
  const countFontSize = props.countFontSize ?? legacy.fontSize ?? 24;
  const countColor = props.countColor ?? legacy.color ?? "#FFFFFF";
  const backgroundType = props.backgroundType ?? "none";

  function handleImageFile(file: File) {
    if (file.type !== "image/png" && file.type !== "image/jpeg") return;
    const reader = new FileReader();
    reader.onload = () => onChange({ backgroundImageDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

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
      <div>
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

      <div className="h-px bg-base-800" />
      <span className={sectionClass}>Label text</span>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className={labelClass}>Font</label>
          <select
            className={fieldClass}
            value={labelFontFamily}
            onChange={(e) => onChange({ labelFontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Font size</label>
          <input
            type="number"
            className={fieldClass}
            value={labelFontSize}
            onChange={(e) => onChange({ labelFontSize: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Color</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={labelColor}
            onChange={(e) => onChange({ labelColor: e.target.value })}
          />
        </div>
      </div>

      <div className="h-px bg-base-800" />
      <span className={sectionClass}>Count number</span>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className={labelClass}>Font</label>
          <select
            className={fieldClass}
            value={countFontFamily}
            onChange={(e) => onChange({ countFontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Font size</label>
          <input
            type="number"
            className={fieldClass}
            value={countFontSize}
            onChange={(e) => onChange({ countFontSize: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Color</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={countColor}
            onChange={(e) => onChange({ countColor: e.target.value })}
          />
        </div>
      </div>

      <div className="h-px bg-base-800" />
      <span className={sectionClass}>Background</span>
      <div>
        <label className={labelClass}>Type</label>
        <select
          className={fieldClass}
          value={backgroundType}
          onChange={(e) => onChange({ backgroundType: e.target.value as ParticipantCountProps["backgroundType"] })}
        >
          <option value="none">None (transparent)</option>
          <option value="color">Solid color</option>
          <option value="image">Image</option>
        </select>
      </div>
      {backgroundType === "color" && (
        <div>
          <label className={labelClass}>Background color</label>
          <input
            type="color"
            className="h-8 w-full rounded border border-base-700 bg-base-800"
            value={props.backgroundColor}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
          />
        </div>
      )}
      {backgroundType === "image" && (
        <>
          <div>
            <label className={labelClass}>Image (PNG, JPG)</label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="text-xs text-base-300"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageFile(file);
              }}
            />
            {props.backgroundImageDataUrl && (
              <button
                onClick={() => onChange({ backgroundImageDataUrl: null })}
                className="mt-1 text-left text-[11px] text-danger-500 hover:underline"
              >
                Remove image
              </button>
            )}
          </div>
          <div>
            <label className={labelClass}>Fit</label>
            <select
              className={fieldClass}
              value={props.backgroundImageFit}
              onChange={(e) =>
                onChange({ backgroundImageFit: e.target.value as ParticipantCountProps["backgroundImageFit"] })
              }
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
        </>
      )}
      {backgroundType !== "none" && (
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
      )}
    </div>
  );
}
