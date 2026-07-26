import { EFFECT_NAMES, EffectName, LandingComponent } from "@/lib/landing/types";
import ReactionsEditor from "./ReactionsEditor";

interface SharedFieldsProps {
  component: LandingComponent;
  onChange: (patch: Partial<LandingComponent>) => void;
  onDelete: () => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

// Các field dùng chung cho MỌI loại component (vị trí/kích thước/hiệu ứng) — panel riêng của từng
// loại chỉ cần render thêm phần đặc thù của nó, không cần lặp lại phần này.
export default function SharedFields({ component, onChange, onDelete }: SharedFieldsProps) {
  // Digit Roller tự tính height từ width + Digit count (xem fitDigitRollerHeight trong
  // LandingBuilderWindow.tsx) — nhập tay vào đây sẽ bị ghi đè lại ngay, nên khoá hẳn field này thay
  // vì để nó trông như nhập được nhưng lại tự đổi ngược, dễ gây khó hiểu.
  const heightLocked = component.type === "luckyWheel" && component.props.template === "digitRoller";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>X</label>
          <input
            type="number"
            className={fieldClass}
            value={Math.round(component.x)}
            onChange={(e) => onChange({ x: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Y</label>
          <input
            type="number"
            className={fieldClass}
            value={Math.round(component.y)}
            onChange={(e) => onChange({ y: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Width</label>
          <input
            type="number"
            className={fieldClass}
            value={Math.round(component.width)}
            onChange={(e) => onChange({ width: Math.max(1, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className={labelClass}>Height{heightLocked ? " (auto)" : ""}</label>
          <input
            type="number"
            disabled={heightLocked}
            title={heightLocked ? "Digit Roller always auto-fits height to width + Digit count" : undefined}
            className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-50`}
            value={Math.round(component.height)}
            onChange={(e) => onChange({ height: Math.max(1, Number(e.target.value)) })}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Effect</label>
        <select
          className={fieldClass}
          value={component.effect}
          onChange={(e) => onChange({ effect: e.target.value as EffectName })}
        >
          {EFFECT_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="h-px bg-base-800" />
      <ReactionsEditor
        reactions={component.reactions ?? []}
        onChange={(reactions) => onChange({ reactions })}
      />

      <button
        onClick={onDelete}
        className="w-full rounded border border-danger-500/30 bg-danger-500/10 px-2 py-1.5 text-xs text-danger-500 hover:bg-danger-500/20"
      >
        Delete component
      </button>
    </div>
  );
}
