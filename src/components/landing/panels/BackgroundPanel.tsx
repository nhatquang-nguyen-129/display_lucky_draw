import { useState } from "react";
import { BackgroundConfig } from "@/lib/landing/types";

interface BackgroundPanelProps {
  background: BackgroundConfig;
  onChange: (patch: Partial<BackgroundConfig>) => void;
}

const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

// 3 bước 1 lượt quay THẬT SỰ đi qua — dò từ DrawSequenceActions (useDrawSequence.ts), KHÔNG bịa
// thêm mốc nào khác: Idle (chưa có candidate) → Spinning (candidate mới, sequence.spinning === true,
// Wheel đang animate) → Revealed (spinning vừa về false, tên/số đã hiện — Confirm có chạy hay chưa
// không tạo thêm mốc thị giác riêng nào). Tên nhóm "When Revealed" bên dưới đặt theo ĐÚNG bước này.
//
// Dim nền lúc Wheel Revealed — GIỮ NGUYÊN 100% field/logic đã có (dimOnSpinEnd, dimAmount,
// dimStart/EndDelay/DurationMs, xem BackgroundConfig trong types.ts + BackgroundDimOverlay.tsx) —
// panel này CHỈ tổ chức lại JSX/label cho khớp cấu trúc "Basic options" phẳng + "Interactions with
// Draw" 2 cấp đã dùng cho các panel khác, không đổi hành vi/dữ liệu, tránh mất cấu hình landing cũ
// đã lưu.
export default function BackgroundPanel({ background, onChange }: BackgroundPanelProps) {
  // Mở sẵn nếu tính năng đang bật (không giấu mất cấu hình user đã set), nhưng SAU ĐÓ hoàn toàn do
  // người dùng tự đóng/mở — không đọc lại `background.dimOnSpinEnd` mỗi render (nếu không, sửa 1 số
  // bất kỳ trong khối sẽ làm React ép lại đúng trạng thái mở lúc mount, "cãi" lại thao tác đóng tay
  // của người dùng).
  const [wheelSectionOpen, setWheelSectionOpen] = useState(() => !!background.dimOnSpinEnd);

  function handleImageFile(file: File) {
    if (file.type !== "image/png" && file.type !== "image/jpeg") return;
    const reader = new FileReader();
    reader.onload = () => onChange({ imageDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>

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

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Interactions with Draw</span>

        <details
          open={wheelSectionOpen}
          onToggle={(e) => setWheelSectionOpen(e.currentTarget.open)}
          className="rounded-lg border border-base-800"
        >
          <summary className="cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-base-100">
            When Revealed
          </summary>

          <div className="space-y-3 border-t border-base-800 px-2.5 pb-2.5 pt-2.5">
            <label className="flex items-center gap-1.5 text-xs text-base-200">
              <input
                type="checkbox"
                checked={!!background.dimOnSpinEnd}
                onChange={(e) => onChange({ dimOnSpinEnd: e.target.checked })}
                className="accent-gold-500"
              />
              Dim background while Revealed
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
                </div>

                <div className="rounded-lg border border-base-800 p-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-base-400">Spinning → Revealed</span>
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
                </div>

                <div className="rounded-lg border border-base-800 p-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-base-400">
                    Revealed → Spinning (next draw)
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
                </div>
              </>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
