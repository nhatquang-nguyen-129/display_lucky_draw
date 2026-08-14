import { BackgroundConfig } from "@/lib/landing/types";

interface BackgroundPanelProps {
  background: BackgroundConfig;
  onChange: (patch: Partial<BackgroundConfig>) => void;
}

const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

export default function BackgroundPanel({ background, onChange }: BackgroundPanelProps) {
  function handleImageFile(file: File) {
    if (file.type !== "image/png" && file.type !== "image/jpeg") return;
    const reader = new FileReader();
    reader.onload = () => onChange({ imageDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      <span className="text-[10px] uppercase tracking-wide text-base-500">Background</span>

      <div>
        <label className={labelClass}>Type</label>
        <select
          className="w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100"
          value={background.type}
          onChange={(e) => onChange({ type: e.target.value as "color" | "image" })}
        >
          <option value="color">Solid color</option>
          <option value="image">Image</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>{background.type === "image" ? "Letterbox color" : "Color"}</label>
        <input
          type="color"
          className="h-8 w-full rounded border border-base-700 bg-base-800"
          value={background.color}
          onChange={(e) => onChange({ color: e.target.value })}
        />
      </div>

      {background.type === "image" && (
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
          </div>
          <div>
            <label className={labelClass}>Fit</label>
            <select
              className="w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100"
              value={background.imageFit ?? "cover"}
              onChange={(e) => onChange({ imageFit: e.target.value as "cover" | "contain" | "stretch" })}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
        </>
      )}

      <div className="h-px bg-base-800" />

      <label className="flex items-center gap-1.5 text-xs text-base-200">
        <input
          type="checkbox"
          checked={!!background.dimOnSpinEnd}
          onChange={(e) => onChange({ dimOnSpinEnd: e.target.checked })}
          className="accent-gold-500"
        />
        Dim background after Wheel finishes
      </label>

      {background.dimOnSpinEnd && (
        <>
          <div>
            <label className={labelClass}>Dim amount ({background.dimAmount ?? 50}%)</label>
            <input
              type="range"
              min={0}
              max={100}
              className="w-full accent-gold-500"
              value={background.dimAmount ?? 50}
              onChange={(e) => onChange({ dimAmount: Number(e.target.value) })}
            />
            <p className="mt-1 text-[10px] leading-snug text-base-500">
              How dark it gets at full dim — shared by both directions below.
            </p>
          </div>

          <div className="rounded-lg border border-base-800 p-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-base-400">
              Start — dim down
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Delay (ms)</label>
                <input
                  type="number"
                  className="w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500"
                  value={background.dimStartDelayMs ?? 0}
                  onChange={(e) => onChange({ dimStartDelayMs: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelClass}>Duration (ms)</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500"
                  value={background.dimStartDurationMs ?? 1000}
                  onChange={(e) => onChange({ dimStartDurationMs: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-base-500">
              Delay counted from the moment the Wheel fully stops. 0 = start dimming right when it
              stops. Negative = start that many ms BEFORE it stops (while still slowing down).
              Positive = wait that many ms after it has already stopped. Duration = how long the
              fade-to-dark itself takes, from start to fully dimmed.
            </p>
          </div>

          <div className="rounded-lg border border-base-800 p-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-base-400">
              Finish — brighten back up
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Delay (ms)</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500"
                  value={background.dimEndDelayMs ?? 0}
                  onChange={(e) => onChange({ dimEndDelayMs: Math.max(0, Number(e.target.value)) })}
                />
              </div>
              <div>
                <label className={labelClass}>Duration (ms)</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500"
                  value={background.dimEndDurationMs ?? 1000}
                  onChange={(e) => onChange({ dimEndDurationMs: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-base-500">
              Delay counted from the moment the next Draw/Discard picks a new candidate. Duration =
              how long the fade-back-to-normal itself takes, from start to fully bright again.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
