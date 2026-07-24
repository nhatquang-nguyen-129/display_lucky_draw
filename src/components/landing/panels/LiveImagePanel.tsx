import { LiveImageProps } from "@/lib/landing/types";
import { Prize } from "@/types";

interface LiveImagePanelProps {
  props: LiveImageProps;
  prizes: Prize[];
  onChange: (patch: Partial<LiveImageProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

// Ảnh fallback PHẢI lấy từ 1 Prize đã có sẵn display_image (nhập ở màn Prizes) — không cho upload
// ảnh mới hoàn toàn ở đây, để landing không bao giờ hiện ảnh giải khác với ảnh đã cấu hình ở Prizes.
// Kết quả quay thật vẫn luôn ưu tiên hơn fallback này (xem PrizeImageView.tsx), không đổi gì ở đó.
export default function LiveImagePanel({ props, prizes, onChange }: LiveImagePanelProps) {
  const withImage = prizes.filter((p) => !!p.display_image);

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Fallback image (before the first draw)</label>
        <select
          className={fieldClass}
          value={prizes.find((p) => p.display_image === props.fallbackImageDataUrl)?.id ?? ""}
          onChange={(e) => {
            const prize = prizes.find((p) => p.id === e.target.value);
            onChange({ fallbackImageDataUrl: prize?.display_image ?? null });
          }}
        >
          <option value="">None</option>
          {withImage.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {withImage.length === 0 && (
          <p className="mt-1 text-[10px] leading-snug text-base-500">
            No prize in this session has an image yet — add one in the Prizes screen first.
          </p>
        )}
        {props.fallbackImageDataUrl && (
          <div className="mt-2 flex items-center gap-2">
            <img src={props.fallbackImageDataUrl} alt="" className="h-10 w-10 rounded border border-base-700 object-cover" />
            <button
              onClick={() => onChange({ fallbackImageDataUrl: null })}
              className="text-left text-[11px] text-danger-500 hover:underline"
            >
              Remove fallback image
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Fit</label>
          <select
            className={fieldClass}
            value={props.fit}
            onChange={(e) => onChange({ fit: e.target.value as LiveImageProps["fit"] })}
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
