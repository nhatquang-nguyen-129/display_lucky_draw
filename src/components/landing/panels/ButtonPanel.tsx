import { ButtonComponent, ButtonProps, LandingComponent } from "@/lib/landing/types";
import { COMPONENT_SIGNALS } from "../componentRegistry";

interface ButtonPanelProps {
  component: ButtonComponent;
  // Tên các Button KHÁC đã có trên trang (không tính chính nút này, đã trim) — Button không còn
  // action nào để phân biệt nữa nên tên PHẢI duy nhất để nhận diện đúng trên Trigger Graph.
  usedNames: string[];
  onChangeComponent: (patch: Partial<LandingComponent>) => void;
  onChange: (patch: Partial<ButtonProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const fieldErrorClass = "border-danger-500 focus:border-danger-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

// Button là Signal EMITTER thuần (xem CLAUDE.md) — không còn field "action" nào để cấu hình ở đây,
// chỉ còn Name (bắt buộc + duy nhất, dùng để nhận diện trên Trigger Graph) + styling thị giác +
// 1 khung thông tin CHỈ ĐỌC liệt kê Event mà Button phát ra. Wiring "khi click thì làm gì" hoàn
// toàn nằm ở Trigger Graph (TriggerLinkPanel.tsx), không phải ở panel này.
export default function ButtonPanel({ component, usedNames, onChangeComponent, onChange }: ButtonPanelProps) {
  const name = component.name?.trim() ?? "";
  const nameError = name === "" ? "Name is required." : usedNames.includes(name) ? "Name is already used by another Button on this page." : null;
  const props = component.props;

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Name</label>
        <input
          className={`${fieldClass} ${nameError ? fieldErrorClass : ""}`}
          value={component.name ?? ""}
          onChange={(e) => onChangeComponent({ name: e.target.value })}
        />
        {nameError ? (
          <p className="mt-1 text-[10px] leading-snug text-danger-500">{nameError}</p>
        ) : (
          <p className="mt-1 text-[10px] leading-snug text-base-500">
            Must be unique — this is how you'll tell this Button apart from others on the Trigger Graph.
          </p>
        )}
      </div>

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

      <div className="rounded border border-base-800 bg-base-800/40 p-2">
        <p className="text-[10px] uppercase tracking-wide text-base-500">Emits to Trigger Graph</p>
        <p className="mt-1 text-xs text-base-200">{(COMPONENT_SIGNALS.button?.emits ?? []).join(", ")}</p>
        <p className="mt-1 text-[10px] leading-snug text-base-500">
          Wire this in the Trigger Graph to make other components react when this button is clicked.
        </p>
      </div>

      <p className="text-[10px] leading-snug text-base-500">
        Buttons only respond to clicks in the real Present Mode window — in this Builder they're
        shown disabled so editing never triggers anything.
      </p>
    </div>
  );
}
