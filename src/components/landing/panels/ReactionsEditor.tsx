import { EffectReaction, LandingTriggerEvent, newReactionId } from "@/lib/landing/types";

interface ReactionsEditorProps {
  reactions: EffectReaction[];
  onChange: (reactions: EffectReaction[]) => void;
}

const TRIGGER_OPTIONS: { value: LandingTriggerEvent; label: string }[] = [
  { value: "draw", label: "On Draw" },
  { value: "confirm", label: "On Confirm" },
  { value: "redo", label: "On Redo" },
];

const inputClass = "w-full rounded border border-base-700 bg-base-800 px-1.5 py-1 text-[11px] text-base-100";

// Dùng chung cho MỌI component (qua SharedFields.tsx) + canvas background (qua BackgroundPanel.tsx)
// — đây chính là phần "generic" của tính năng trigger/hiệu ứng: thêm 1 reaction mới chỉ là thêm 1
// phần tử vào mảng, không cần code riêng cho từng cặp component/trigger.
export default function ReactionsEditor({ reactions, onChange }: ReactionsEditorProps) {
  function addReaction() {
    onChange([...reactions, { id: newReactionId(), trigger: "draw", delayMs: 0, durationMs: 0 }]);
  }
  function updateReaction(id: string, patch: Partial<EffectReaction>) {
    onChange(reactions.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeReaction(id: string) {
    onChange(reactions.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-base-500">Trigger reactions</span>
        <button onClick={addReaction} className="text-[10px] text-gold-400 hover:text-gold-300">
          + Add
        </button>
      </div>
      {reactions.length === 0 && (
        <p className="text-[10px] leading-snug text-base-500">
          No reactions — stays static regardless of Draw/Confirm/Redo.
        </p>
      )}
      {reactions.map((r) => (
        <div key={r.id} className="space-y-1.5 rounded border border-base-800 p-2">
          <div className="flex items-center gap-1.5">
            <select
              className={`${inputClass} flex-1`}
              value={r.trigger}
              onChange={(e) => updateReaction(r.id, { trigger: e.target.value as LandingTriggerEvent })}
            >
              {TRIGGER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button onClick={() => removeReaction(r.id)} className="shrink-0 text-base-500 hover:text-danger-500">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] text-base-500">
              Delay (ms)
              <input
                type="number"
                min={0}
                className={`${inputClass} mt-0.5`}
                value={r.delayMs}
                onChange={(e) => updateReaction(r.id, { delayMs: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label className="text-[10px] text-base-500">
              Duration (ms, 0=until next)
              <input
                type="number"
                min={0}
                className={`${inputClass} mt-0.5`}
                value={r.durationMs}
                onChange={(e) => updateReaction(r.id, { durationMs: Math.max(0, Number(e.target.value)) })}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] text-base-500">
              Dim (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                placeholder="—"
                className={`${inputClass} mt-0.5`}
                value={r.dim ?? ""}
                onChange={(e) =>
                  updateReaction(r.id, {
                    dim: e.target.value === "" ? undefined : Math.min(1, Math.max(0, Number(e.target.value))),
                  })
                }
              />
            </label>
            <label className="text-[10px] text-base-500">
              Scale (e.g. 1.15)
              <input
                type="number"
                min={0.1}
                step={0.05}
                placeholder="—"
                className={`${inputClass} mt-0.5`}
                value={r.scale ?? ""}
                onChange={(e) =>
                  updateReaction(r.id, { scale: e.target.value === "" ? undefined : Number(e.target.value) })
                }
              />
            </label>
          </div>

          <label className="flex items-center gap-1.5 text-[10px] text-base-500">
            <input
              type="checkbox"
              className="accent-gold-500"
              checked={!!r.glow}
              onChange={(e) => updateReaction(r.id, { glow: e.target.checked })}
            />
            Glow border
          </label>
          {r.glow && (
            <input
              type="color"
              className="h-6 w-full rounded border border-base-700 bg-base-800"
              value={r.glowColor ?? "#FFCA2D"}
              onChange={(e) => updateReaction(r.id, { glowColor: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}
