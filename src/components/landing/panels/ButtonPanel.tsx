import { ButtonAction, ButtonProps } from "@/lib/landing/types";

interface ButtonPanelProps {
  props: ButtonProps;
  // Danh sách tên cột optional đã được gán Loại dữ liệu "url" ở Data Editor (session hiện tại) —
  // nguồn cho picker của action "openLink" (xem LandingBuilderWindow.tsx, nơi tính giá trị này).
  urlFields: string[];
  onChange: (patch: Partial<ButtonProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

const ACTION_OPTIONS: { value: ButtonAction; label: string; hint: string }[] = [
  { value: "draw", label: "Draw", hint: "Picks a candidate winner — not recorded yet." },
  { value: "confirm", label: "Confirm", hint: "Records the currently shown candidate for real." },
  {
    value: "redo",
    label: "Redo",
    hint: "Rejects the current candidate and re-picks for the same prize.",
  },
  {
    value: "openLink",
    label: "Open Link",
    hint: "Opens the current winner's URL field in the default browser.",
  },
];

// Chỉ hoạt động thật trong Present Mode — trong Builder canvas Button luôn hiện disabled để
// tránh bấm nhầm chạy quay số thật lúc đang chỉnh sửa (xem ButtonView.tsx).
export default function ButtonPanel({ props, urlFields, onChange }: ButtonPanelProps) {
  const selected = ACTION_OPTIONS.find((o) => o.value === props.action) ?? ACTION_OPTIONS[0];

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Action</label>
        <select
          className={fieldClass}
          value={props.action}
          onChange={(e) => onChange({ action: e.target.value as ButtonAction })}
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-snug text-base-500">{selected.hint}</p>
      </div>

      {props.action === "openLink" && (
        <div>
          <label className={labelClass}>URL field</label>
          {urlFields.length === 0 ? (
            <p className="text-[10px] leading-snug text-base-500">
              No column is set to the "URL" data type yet — assign it in the Data Editor's column
              dropdown first.
            </p>
          ) : (
            <select
              className={fieldClass}
              value={props.urlField ?? ""}
              onChange={(e) => onChange({ urlField: e.target.value || undefined })}
            >
              <option value="">Select a column…</option>
              {urlFields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div>
        <label className={labelClass}>Label</label>
        <input className={fieldClass} value={props.label} onChange={(e) => onChange({ label: e.target.value })} />
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
          <label className={labelClass}>Text color</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Background</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.backgroundColor}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
          />
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
          <label className={labelClass}>Stroke color</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.strokeColor}
            onChange={(e) => onChange({ strokeColor: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Stroke width</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.strokeWidth}
            onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
          />
        </div>
      </div>

      <p className="text-[10px] leading-snug text-base-500">
        Buttons only respond to clicks in the real Present Mode window — in this Builder they're
        shown disabled so editing never triggers a real draw.
      </p>
    </div>
  );
}
