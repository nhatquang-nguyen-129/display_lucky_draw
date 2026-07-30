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
    </div>
  );
}
