import { ImageProps } from "@/lib/landing/types";

interface ImagePanelProps {
  props: ImageProps;
  onChange: (patch: Partial<ImageProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

export default function ImagePanel({ props, onChange }: ImagePanelProps) {
  function handleFile(file: File) {
    if (file.type !== "image/png") return;
    const reader = new FileReader();
    reader.onload = () => onChange({ srcDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Image (PNG)</label>
        <input
          type="file"
          accept="image/png"
          className="text-xs text-base-300"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {props.srcDataUrl && (
          <button
            onClick={() => onChange({ srcDataUrl: null })}
            className="mt-1 text-left text-[11px] text-danger-500 hover:underline"
          >
            Remove image
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Fit</label>
          <select
            className={fieldClass}
            value={props.fit}
            onChange={(e) => onChange({ fit: e.target.value as ImageProps["fit"] })}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="stretch">Stretch</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Border radius</label>
          <input
            type="number"
            className={fieldClass}
            value={props.borderRadius}
            onChange={(e) => onChange({ borderRadius: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
