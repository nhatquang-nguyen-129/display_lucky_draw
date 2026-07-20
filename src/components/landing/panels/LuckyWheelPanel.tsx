import { LuckyWheelProps, LuckyWheelTemplate, ParticipantDisplayField, ParticipantKeyField } from "@/lib/landing/types";

interface LuckyWheelPanelProps {
  props: LuckyWheelProps;
  sessionName: string;
  onChange: (patch: Partial<LuckyWheelProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

const TEMPLATE_OPTIONS: { value: LuckyWheelTemplate; label: string }[] = [
  { value: "wheel", label: "Wheel (circular)" },
  { value: "digitRoller", label: "Digit Roller (slot-machine numbers)" },
];

const KEY_FIELD_OPTIONS: { value: ParticipantKeyField; label: string }[] = [
  { value: "participantId", label: "Participant ID" },
  { value: "code", label: "Code" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
];

const DISPLAY_FIELD_OPTIONS: { value: ParticipantDisplayField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "code", label: "Code" },
];

const FONT_OPTIONS = [
  { value: "Inter, ui-sans-serif, sans-serif", label: "Sans (default)" },
  { value: "Georgia, serif", label: "Serif" },
  { value: "'Courier New', monospace", label: "Monospace" },
];

export default function LuckyWheelPanel({ props, sessionName, onChange }: LuckyWheelPanelProps) {
  const isWheel = props.template === "wheel";
  const isDigitRoller = props.template === "digitRoller";

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Draw Session</label>
        <p className="rounded border border-base-800 bg-base-800/50 px-2 py-1.5 text-xs text-base-300">
          {sessionName} <span className="text-base-500">(current session, fixed)</span>
        </p>
      </div>

      <div>
        <label className={labelClass}>Template</label>
        <select
          className={fieldClass}
          value={props.template}
          onChange={(e) => onChange({ template: e.target.value as LuckyWheelTemplate })}
        >
          {TEMPLATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-snug text-base-500">
          More templates will be added here over time — this only changes how the winner is
          revealed, the data binding below stays the same.
        </p>
      </div>

      <div className="h-px bg-base-800" />
      <span className="block text-[10px] uppercase tracking-wide text-base-500">Data binding</span>

      {isWheel && (
        <>
          <div>
            <label className={labelClass}>Draw field (identifies each segment)</label>
            <select
              className={fieldClass}
              value={props.drawField}
              onChange={(e) => onChange({ drawField: e.target.value as ParticipantKeyField })}
            >
              {KEY_FIELD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Display field (shown on the wheel)</label>
            <select
              className={fieldClass}
              value={props.displayField}
              onChange={(e) => onChange({ displayField: e.target.value as ParticipantDisplayField })}
            >
              {DISPLAY_FIELD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div>
        <label className={labelClass}>
          {isDigitRoller ? "Source field (digits are extracted from this)" : "Winner display field (shown after landing)"}
        </label>
        <select
          className={fieldClass}
          value={props.winnerDisplayField}
          onChange={(e) => onChange({ winnerDisplayField: e.target.value as ParticipantDisplayField })}
        >
          {DISPLAY_FIELD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {isDigitRoller && (
          <p className="mt-1 text-[10px] leading-snug text-base-500">
            Pick "Phone" for a masked-phone reveal (e.g. 0917xxx892 → rolls in "892").
          </p>
        )}
      </div>

      {isDigitRoller && (
        <div>
          <label className={labelClass}>Digit count</label>
          <input
            type="number"
            min={1}
            max={10}
            className={fieldClass}
            value={props.digitCount}
            onChange={(e) => onChange({ digitCount: Math.max(1, Number(e.target.value)) })}
          />
        </div>
      )}

      {isWheel && (
        <label className="flex items-center gap-1.5 text-xs text-base-200">
          <input
            type="checkbox"
            checked={props.maskSensitiveData}
            onChange={(e) => onChange({ maskSensitiveData: e.target.checked })}
            className="accent-gold-500"
          />
          Mask phone numbers
        </label>
      )}

      <div className="h-px bg-base-800" />
      <span className="block text-[10px] uppercase tracking-wide text-base-500">Display</span>

      <div>
        <label className={labelClass}>Font</label>
        <select className={fieldClass} value={props.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })}>
          {FONT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
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
        {isWheel && (
          <div>
            <label className={labelClass}>Color</label>
            <input
              type="color"
              className="h-[26px] w-full rounded border border-base-700 bg-base-800"
              value={props.fontColor}
              onChange={(e) => onChange({ fontColor: e.target.value })}
            />
          </div>
        )}
      </div>
      {isDigitRoller && (
        <p className="text-[10px] leading-snug text-base-500">
          Digit Roller always uses dark text on white cards for contrast, like a real number
          board — color isn't configurable yet.
        </p>
      )}

      <div className="h-px bg-base-800" />
      <span className="block text-[10px] uppercase tracking-wide text-base-500">Spin behavior</span>

      <div>
        <label className={labelClass}>Spin duration (ms)</label>
        <input
          type="number"
          step={100}
          min={500}
          className={fieldClass}
          value={props.spinDurationMs}
          onChange={(e) => onChange({ spinDurationMs: Number(e.target.value) })}
        />
      </div>
      <div>
        <label className={labelClass}>Spin style (acceleration/deceleration)</label>
        <select
          className={fieldClass}
          value={props.spinEasing}
          onChange={(e) => onChange({ spinEasing: e.target.value as LuckyWheelProps["spinEasing"] })}
        >
          <option value="linear">Linear (constant speed)</option>
          <option value="easeOut">Fast start, slow stop</option>
          <option value="easeInOut">Smooth start and stop</option>
        </select>
      </div>
      <p className="text-[10px] leading-snug text-base-500">
        Auto-stop is always on — it always lands on the real winner drawn from the Draw page.
      </p>
    </div>
  );
}
