import { useState } from "react";
import { DrawSequenceActions, LandingData, PrizeGalleryComponent } from "@/lib/landing/types";
import { Prize } from "@/types";

// Lưới ảnh TẤT CẢ giải trong session — xem doc-comment PrizeGalleryProps trong types.ts. Chỉ tương
// tác được (hover glow/click chọn) khi `sequence` truthy, tức đang ở Present Mode thật — giống hệt
// ButtonView.tsx tự disable trong Builder canvas (LandingRenderer.tsx chỉ truyền sequence thật khi
// `interactive`), tránh chọn/bấm nhầm lúc đang chỉnh sửa layout.
export default function PrizeGalleryView({
  component,
  data,
  sequence,
}: {
  component: PrizeGalleryComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  const { columns, gap, imageFit, borderRadius, showName, nameFontSize, nameColor, glowColor } = component.props;
  const prizes = data?.prizes ?? [];
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  function isDisabled(prize: Prize) {
    return prize.remaining <= 0 || prize.status !== "active";
  }

  function handleClick(prize: Prize) {
    if (!sequence) return;
    if (isDisabled(prize)) {
      sequence.notifyOutOfStock(prize.name);
      return;
    }
    sequence.togglePrizeSelection(prize.id);
  }

  return (
    // LandingRenderer đặt pointer-events: none mặc định lên khung của MỌI component (xem comment ở
    // đó) — bật lại ở đây giống hệt ButtonView.tsx, dựa vào `disabled={!sequence}` trên từng ô (native
    // <button disabled> tự chặn hẳn mouseenter/click, không bắn ra ngoài) để thật sự vô hiệu hoá hover/
    // click trong Builder canvas, không phải dựa vào pointer-events.
    <div
      className="grid h-full w-full content-start overflow-y-auto"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, 1fr)`, gap, pointerEvents: "auto" }}
    >
      {prizes.map((prize) => {
        const disabled = isDisabled(prize);
        const selected = sequence?.selectedPrizeId === prize.id;
        const previewGlow = !disabled && !selected && !!sequence && hoveredId === prize.id;
        // Đã CHỌN (click, không phải hover xem trước) — phóng to ~10% + viền sáng đậm, đứng yên tới
        // khi bỏ chọn/chọn giải khác. zIndex nâng lên để không bị các ô lân cận (chưa scale) đè lên
        // 1 phần trong lúc phóng to vượt khỏi khung ô gốc — xem PrizeImageView.tsx (cùng 1 spec).
        const glow = selected
          ? `0 0 0 3px ${glowColor}, 0 0 26px 8px ${glowColor}`
          : previewGlow
            ? `0 0 0 2px ${glowColor}, 0 0 14px 3px ${glowColor}99`
            : undefined;
        return (
          <button
            key={prize.id}
            type="button"
            disabled={!sequence}
            onMouseEnter={() => !disabled && setHoveredId(prize.id)}
            onMouseLeave={() => setHoveredId((cur) => (cur === prize.id ? null : cur))}
            onClick={() => handleClick(prize)}
            className={`relative flex flex-col items-center gap-1 rounded-lg p-1.5 ${
              disabled ? "cursor-not-allowed" : sequence ? "cursor-pointer" : "cursor-default"
            }`}
            style={{
              boxShadow: glow,
              transform: selected ? "scale(1.1)" : "scale(1)",
              transition: "transform 150ms ease-out, box-shadow 150ms ease-out, filter 150ms ease-out",
              zIndex: selected ? 10 : undefined,
              filter: disabled ? "brightness(0.42) saturate(0.7)" : undefined,
            }}
          >
            <div
              className="flex aspect-square w-full items-center justify-center overflow-hidden bg-base-800/40"
              style={{ borderRadius }}
            >
              {prize.display_image ? (
                <img
                  src={prize.display_image}
                  alt=""
                  className="h-full w-full"
                  style={{ objectFit: imageFit === "stretch" ? "fill" : imageFit, borderRadius }}
                />
              ) : (
                <span className="text-xs text-base-500">No image</span>
              )}
            </div>
            {showName && (
              <span className="w-full truncate text-center" style={{ fontSize: nameFontSize, color: nameColor }}>
                {prize.name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
