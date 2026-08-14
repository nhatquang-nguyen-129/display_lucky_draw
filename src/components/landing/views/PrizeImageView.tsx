import { useState } from "react";
import { DrawSequenceActions, LandingData, PrizeImageComponent } from "@/lib/landing/types";

// "latestWinner" (mặc định, hành vi gốc) — tự đổi theo results[0], dùng cho kiểu "công bố kết quả".
// "specificPrize" — LUÔN hiện đúng 1 giải CỐ ĐỊNH do người dùng chọn (props.prizeId), không đổi theo
// kết quả quay. Đặt nhiều instance kiểu này rải khắp landing (mỗi cái tự do vị trí/kích thước khớp
// artwork nền) để mỗi ảnh đại diện ĐÚNG 1 giải — không sinh thêm ảnh theo quantity của giải. Bật
// `selectable` thì hover/click = "select prize to draw": hover riêng chỉ viền sáng NHẸ (xem trước),
// CLICK mới thật sự chọn — phóng to ~10% (scale 1.1) + viền sáng ĐẬM, đứng yên tới khi bỏ chọn/chọn
// giải khác. Hết hàng (remaining <= 0) hoặc không active thì TỐI ĐI (brightness thấp, không phải
// grayscale) + không chọn được nữa — click vào lúc đó chỉ hiện popup báo hết, phải chọn giải khác.
// Tái dùng nguyên `sequence.selectedPrizeId`/`togglePrizeSelection`/`notifyOutOfStock` đã có (xem
// PrizeGalleryView.tsx — cùng 1 spec thị giác, dùng chung để nhất quán dù đặt rời hay theo lưới).
export default function PrizeImageView({
  component,
  data,
  sequence,
}: {
  component: PrizeImageComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  const { fit, borderRadius, fallbackImageDataUrl, source, prizeId, selectable, glowColor } = component.props;
  const [hovered, setHovered] = useState(false);

  const boundPrize = source === "specificPrize" ? (data?.prizes.find((p) => p.id === prizeId) ?? null) : null;
  const latest = data?.results[0];
  const src =
    source === "specificPrize"
      ? (boundPrize?.display_image ?? fallbackImageDataUrl)
      : (latest?.prize_display_image ?? fallbackImageDataUrl);

  const interactive = source === "specificPrize" && selectable && !!sequence && !!boundPrize;
  const disabled = interactive && (boundPrize!.remaining <= 0 || boundPrize!.status !== "active");
  const selected = interactive && sequence!.selectedPrizeId === boundPrize!.id;
  const previewGlow = interactive && !disabled && !selected && hovered;

  function handleClick() {
    if (!interactive || !boundPrize) return;
    if (disabled) {
      sequence!.notifyOutOfStock(boundPrize.name);
      return;
    }
    sequence!.togglePrizeSelection(boundPrize.id);
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-base-800/40 ${interactive ? "cursor-pointer" : ""}`}
      style={{
        borderRadius,
        pointerEvents: interactive ? "auto" : undefined,
        transform: selected ? "scale(1.1)" : "scale(1)",
        transition: "transform 150ms ease-out, box-shadow 150ms ease-out, filter 150ms ease-out",
        boxShadow: selected
          ? `0 0 0 3px ${glowColor}, 0 0 26px 8px ${glowColor}`
          : previewGlow
            ? `0 0 0 2px ${glowColor}, 0 0 14px 3px ${glowColor}99`
            : undefined,
        filter: disabled ? "brightness(0.42) saturate(0.7)" : undefined,
      }}
      onMouseEnter={() => interactive && !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={interactive ? handleClick : undefined}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full" style={{ objectFit: fit === "stretch" ? "fill" : fit, borderRadius }} />
      ) : (
        <span className="text-xs text-base-500">No image</span>
      )}
    </div>
  );
}
