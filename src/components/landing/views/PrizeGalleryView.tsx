import { useEffect, useRef, useState } from "react";
import { DEFAULT_PRIZE_STAGE_EFFECT, DrawSequenceActions, LandingData, PrizeGalleryComponent } from "@/lib/landing/types";
import { Prize } from "@/types";
import PrizeEffectOverlay from "./PrizeEffectOverlay";
import { ensureAlphaLoaded } from "./pixelAlphaHitTest";
import { computePrizeTransform, cssVarsToStyle, resolvePrizeEffects } from "./prizeEffectTransform";
import { registerPrizeHitTarget } from "./prizeHitCoordinator";

// Lưới ảnh TẤT CẢ giải trong session — xem doc-comment PrizeGalleryProps trong types.ts. Chỉ tương
// tác được (click chọn) khi `sequence` truthy, tức đang ở Present Mode thật — giống hệt ButtonView.tsx
// tự disable trong Builder canvas (LandingRenderer.tsx chỉ truyền sequence thật khi `interactive`),
// tránh chọn/bấm nhầm lúc đang chỉnh sửa layout. 4 giai đoạn tương tác (onHover/onSelect/onWon/
// onOutOfStock) — xem doc-comment đầu PrizeImageView.tsx (cùng 1 spec thị giác, dùng chung để nhất
// quán dù đặt rời hay theo lưới).
export default function PrizeGalleryView({
  component,
  data,
  sequence,
}: {
  component: PrizeGalleryComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  const { columns, gap, imageFit, borderRadius, showName, nameFontSize, nameColor, dimUnselectedAmount } = component.props;
  // Landing lưu TRƯỚC KHI có hệ 4-giai-đoạn này không có 4 field object dưới đây trong JSON đã lưu dù
  // TypeScript khai báo bắt buộc — PHẢI fallback, xem doc-comment DEFAULT_PRIZE_STAGE_EFFECT trong
  // types.ts (thiếu bước này crash trắng màn hình ngay khi mở Properties Panel của prize cũ).
  const onHover = component.props.onHover ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onSelect = component.props.onSelect ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onWon = component.props.onWon ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onOutOfStock = component.props.onOutOfStock ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const outOfStockDimAmount = component.props.outOfStockDimAmount ?? 58;
  const prizes = data?.prizes ?? [];
  // Ô nào đang được hover (id giải, hoặc null) — xem doc-comment `hovered` trong PrizeImageView.tsx
  // (cùng spec, chỉ khác cần 1 id thay vì boolean vì đây là 1 lưới nhiều ô). Tính QUA
  // prizeHitCoordinator.ts (không phải onMouseMove/onClick cục bộ ở từng nút) — nhiều ô đè bounding
  // box lên nhau (vd đặt gần sát mép) thì phải dò lại TOÀN BỘ ngăn xếp phần tử tại điểm chuột, không
  // chỉ mỗi nút tự biết về bản thân nó (xem doc-comment đầu prizeHitCoordinator.ts).
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const imgRefs = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    prizes.forEach((p) => ensureAlphaLoaded(p.display_image));
  }, [prizes]);

  function isDisabled(prize: Prize) {
    return prize.remaining <= 0 || prize.status !== "active";
  }

  // Khoá TẠM THỜI (busy: 1 hành động ghi DB + nạp lại data đang chạy; spinning: Wheel đang quay,
  // "giữ nguyên selection cho tới khi quay xong") — KHÁC với `isDisabled(prize)` (hết hàng/không
  // active, xám VĨNH VIỄN tới khi có thêm hàng). Locked KHÔNG đổi giao diện ô (không xám, không đổi
  // opacity) — chỉ tắt tương tác + đổi cursor, giữ nguyên đúng cảm giác "tạm dừng", không phải "bị khoá".
  const locked = !sequence || sequence.busy || sequence.spinning;

  // Dữ liệu "sống" theo TỪNG prize, đọc bởi callback đã đăng ký với prizeHitCoordinator.ts — callback
  // chỉ được TẠO ĐÚNG 1 LẦN cho mỗi prize.id (xem getButtonRefCallback bên dưới, tái dùng lại chính
  // cùng 1 function reference qua các lần render để KHÔNG làm React đăng ký/huỷ lại ref liên tục), nên
  // callback phải đọc field qua ref (cập nhật lại MỖI RENDER ngay trong vòng lặp .map() bên dưới) mới
  // luôn thấy giá trị mới nhất thay vì bị "đóng băng" ở giá trị lúc tạo.
  const liveRef = useRef(new Map<string, { src: string | null; fit: "cover" | "contain" | "stretch"; disabled: boolean; locked: boolean; name: string }>());
  const sequenceRef = useRef(sequence);
  sequenceRef.current = sequence;
  const hitUnregisterRef = useRef(new Map<string, () => void>());
  const refCallbacksRef = useRef(new Map<string, (el: HTMLButtonElement | null) => void>());

  function getButtonRefCallback(prizeId: string) {
    const existing = refCallbacksRef.current.get(prizeId);
    if (existing) return existing;
    const cb = (el: HTMLButtonElement | null) => {
      if (el) {
        if (hitUnregisterRef.current.has(prizeId)) return;
        const unregister = registerPrizeHitTarget(el, {
          getSrc: () => liveRef.current.get(prizeId)?.src ?? null,
          getFit: () => liveRef.current.get(prizeId)?.fit ?? "cover",
          getImgRect: () => imgRefs.current.get(prizeId)?.getBoundingClientRect() ?? el.getBoundingClientRect(),
          setHover: (hovering) => setHoveredId((cur) => (hovering ? prizeId : cur === prizeId ? null : cur)),
          onOpaqueClick: () => {
            const live = liveRef.current.get(prizeId);
            if (!live || live.locked) return;
            if (live.disabled) {
              sequenceRef.current!.notifyOutOfStock(live.name);
              return;
            }
            sequenceRef.current!.togglePrizeSelection(prizeId);
          },
        });
        hitUnregisterRef.current.set(prizeId, unregister);
      } else {
        hitUnregisterRef.current.get(prizeId)?.();
        hitUnregisterRef.current.delete(prizeId);
        refCallbacksRef.current.delete(prizeId);
      }
    };
    refCallbacksRef.current.set(prizeId, cb);
    return cb;
  }

  return (
    // LandingRenderer đặt pointer-events: none mặc định lên khung của MỌI component (xem comment ở
    // đó) — bật lại ở đây giống hệt ButtonView.tsx, dựa vào `disabled={locked}` trên từng ô (native
    // <button disabled> tự chặn hẳn mouseenter/click, không bắn ra ngoài) để thật sự vô hiệu hoá hover/
    // click trong Builder canvas VÀ trong lúc khoá tạm thời, không phải dựa vào pointer-events.
    <div
      className="grid h-full w-full content-start overflow-y-auto"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, 1fr)`, gap, pointerEvents: "auto" }}
    >
      {prizes.map((prize) => {
        const disabled = isDisabled(prize);
        const selected = sequence?.selectedPrizeId === prize.id;
        // ĐÚNG giải này VỪA được Wheel trả về — KHÔNG đợi Confirm, VÀ đợi Wheel/WinnerName quay/hiện
        // xong hẳn (`!spinning`) mới coi là "vừa thắng" — xem doc-comment justWon trong
        // PrizeImageView.tsx (cùng spec, lý do y hệt: candidate set NGAY lúc bấm Draw, sớm hơn nhiều so
        // với lúc người xem thật sự nhìn thấy tên/kết quả). `key` theo `candidate.seed` để remount đúng
        // lúc dù cùng 1 giải trúng liên tiếp (Multiple Draw) — boolean này không tự về false giữa 2
        // lượt đó.
        const justWon = !!sequence && !!sequence.candidate && sequence.candidate.prizeId === prize.id && !sequence.spinning;
        // "Spotlight" — SUỐT lúc Wheel đang quay, MỌI ô KHÔNG PHẢI giải đang chọn tự tối đi để làm nổi
        // bật đúng ô đang quay giữa cả lưới — xem doc-comment PrizeGalleryProps.dimUnselectedAmount.
        // Loại trừ `disabled` (đã có dim riêng cho hết hàng) và chính `selected`.
        const dimmed = !!sequence && !disabled && !selected && sequence.spinning && !!sequence.selectedPrizeId;
        liveRef.current.set(prize.id, { src: prize.display_image, fit: imageFit, disabled, locked, name: prize.name });

        const hovering = !!sequence && !disabled && !selected && !locked && hoveredId === prize.id;
        const persistentStage = disabled ? onOutOfStock : selected ? onSelect : hovering ? onHover : null;
        const oneshotStage = justWon ? { stage: onWon, key: `won-${sequence!.candidate!.seed}` } : null;
        const resolved = resolvePrizeEffects(persistentStage, oneshotStage);
        // `anchorImage` — bám neo Scale Up về đúng pixel ảnh thật, xem doc-comment computePrizeTransform
        // trong prizeEffectTransform.ts. boxWidth/boxHeight dùng 1:1 (KHÔNG phải component.width/height
        // — đó là khung của CẢ LƯỚI, mỗi Ô ảnh lại LUÔN vuông, "aspect-square", xem JSX bên dưới).
        const focusTransform = resolved.focus
          ? computePrizeTransform(resolved.focus.config, resolved.focus.mode, {
              src: prize.display_image,
              boxWidth: 1,
              boxHeight: 1,
              fit: imageFit,
            })
          : {};
        const motionTransform = resolved.motion ? computePrizeTransform(resolved.motion.config, resolved.motion.mode) : {};

        return (
          <button
            key={prize.id}
            ref={getButtonRefCallback(prize.id)}
            type="button"
            disabled={locked}
            className={`relative rounded-lg p-1.5 ${disabled ? "cursor-not-allowed" : locked ? "cursor-default" : "cursor-pointer"}`}
            style={{
              zIndex: selected ? 10 : undefined,
              transition: "filter 150ms ease-out",
              filter: disabled
                ? `brightness(${1 - (outOfStockDimAmount ?? 58) / 100})`
                : dimmed
                  ? `brightness(${1 - (dimUnselectedAmount ?? 60) / 100})`
                  : undefined,
            }}
          >
            {/* Wrapper Focus — chỉ chiếm transform của NHÓM Focus (scaleUp/lift), áp dụng lên CẢ ảnh
                lẫn tên giải bên dưới (đúng khung nhìn "cả ô nhích/phóng to cùng nhau"). `key` remount
                lúc oneshot để replay đúng lượt Multiple Draw dù cùng 1 effect (xem resolvePrizeEffects). */}
            <div
              key={resolved.focus?.mode === "oneshot" ? resolved.focus.key : undefined}
              className={`flex flex-col items-center gap-1 ${focusTransform.className ?? ""}`}
              style={{
                transform: focusTransform.transform ?? "scale(1)",
                // `transformOrigin` cũng PHẢI transition CÙNG `transform` — xem doc-comment tương ứng
                // trong PrizeImageView.tsx (thiếu nó gây "nhảy" vị trí lúc scaleUp có hướng tắt đi).
                transformOrigin: focusTransform.transformOrigin,
                transition: focusTransform.className ? undefined : "transform 150ms ease-out, transform-origin 150ms ease-out",
                ...cssVarsToStyle(focusTransform.cssVars),
              }}
            >
              {/* Wrapper KHÔNG clip (khác div bên trong) — chỉ để PrizeEffectOverlay đặt ra NGOÀI ô ảnh,
                  tránh bị overflow-hidden của ô cắt mất phần quầng sáng lan ra ngoài rìa. Cao/rộng tự
                  khớp đúng ô ảnh vì đây là con duy nhất theo flow bình thường (aspect-square đặt kích
                  thước, wrapper tự ôm theo). */}
              <div className="relative w-full">
                {/* Wrapper Motion — chỉ bọc ô ảnh (đã clip), chiếm transform của NHÓM Motion
                    (bounce/pulse/shake), tách riêng khỏi wrapper Focus ở trên để 2 nhóm animate ĐỒNG
                    THỜI không tranh chấp `transform`. */}
                <div
                  key={resolved.motion?.mode === "oneshot" ? resolved.motion.key : undefined}
                  className={motionTransform.className ?? ""}
                  style={cssVarsToStyle(motionTransform.cssVars)}
                >
                  {/* Nền mờ CHỈ hiện khi KHÔNG có ảnh thật (placeholder "No image") — có ảnh (nhất là PNG
                      đã tách nền, trong suốt) thì tuyệt đối không phủ gì lên trên, giữ đúng nguyên bản ảnh
                      gốc. overflow-hidden ở ĐÂY (không phải wrapper ngoài) để vẫn cắt gọn hiệu ứng overlay
                      (glow/sweep) trong đúng khung ô, không tràn sang ô lân cận. */}
                  <div
                    className={`relative flex aspect-square w-full items-center justify-center overflow-hidden ${
                      !prize.display_image ? "bg-base-800/40" : ""
                    }`}
                    style={{ borderRadius }}
                  >
                    {prize.display_image ? (
                      <img
                        ref={(el) => {
                          if (el) imgRefs.current.set(prize.id, el);
                          else imgRefs.current.delete(prize.id);
                        }}
                        src={prize.display_image}
                        alt=""
                        className="h-full w-full"
                        style={{ objectFit: imageFit === "stretch" ? "fill" : imageFit, borderRadius }}
                      />
                    ) : (
                      <span className="text-xs text-base-500">No image</span>
                    )}
                  </div>
                </div>
                {prize.display_image && resolved.highlightPersistent && (
                  <PrizeEffectOverlay
                    config={resolved.highlightPersistent}
                    mode="persistent"
                    imageSrc={prize.display_image}
                    fit={imageFit}
                    borderRadius={borderRadius}
                  />
                )}
                {prize.display_image && resolved.highlightOneshot && (
                  <PrizeEffectOverlay
                    key={resolved.highlightOneshot.key}
                    config={resolved.highlightOneshot.config}
                    mode="oneshot"
                    imageSrc={prize.display_image}
                    fit={imageFit}
                    borderRadius={borderRadius}
                  />
                )}
              </div>
              {showName && (
                <span className="w-full truncate text-center" style={{ fontSize: nameFontSize, color: nameColor }}>
                  {prize.name}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
