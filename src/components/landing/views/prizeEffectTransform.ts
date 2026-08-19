import { CSSProperties } from "react";
import { DEFAULT_PRIZE_GROUP_EFFECT, PrizeEffectName, PrizeGroupEffect, PrizeStageEffect } from "@/lib/landing/types";
import { nearestOpaqueBoxFraction } from "./pixelAlphaHitTest";

export type PrizeEffectRenderMode = "persistent" | "oneshot";

// "Transform-category" — effect biến đổi TRỰC TIẾP element ảnh thật (transform/animation trên chính
// nó), KHÔNG qua 1 lớp overlay riêng — xem doc-comment PrizeStageEffect trong types.ts. Effect còn
// lại (glow/sweep) là "overlay-category", vẽ ở PrizeEffectOverlay.tsx thay vì file này.
const TRANSFORM_EFFECTS = new Set<PrizeEffectName>(["scaleUp", "lift", "bounce", "pulse", "shake"]);

export function isTransformEffect(effect: PrizeEffectName): boolean {
  return TRANSFORM_EFFECTS.has(effect);
}

export interface PrizeTransform {
  transform?: string;
  transformOrigin?: string;
  className?: string;
  cssVars?: Record<string, string>;
  // CHỈ scaleUp/lift persistent set field này — ghi đè `transition` mặc định ("transform 150ms
  // ease-out...") mà PrizeImageView.tsx tự áp cho MỌI effect dùng `transform`
  // INLINE (không `className`) khi effect đó KHÔNG active (bật/tắt tức thì không hợp — xem
  // SETTLE_EASING bên dưới, cần transition RIÊNG khớp đúng nhịp lúc BẬT để lúc TẮT cảm giác như đảo
  // ngược).
  transition?: string;
}

// Easing DÙNG CHUNG cho MỌI effect persistent kiểu "di chuyển-tới-vị-trí-rồi-Ở-LẠI-đó" (scaleUp VÀ
// lift) — PHẢI khớp với keyframe `prize-fx-lift-move` trong landingEffects.css (đổi 1 trong 2 chỗ thì
// phải đổi luôn chỗ còn lại, xem doc-comment ở đó): 700ms, 3 pha tăng tốc/đều/giảm tốc theo đúng tỉ lệ
// 10%-80%-10% thời gian. `linear()` là easing function CSS chuẩn (Chromium 113+, an toàn với Electron
// 32 dùng Chromium 128) cho phép vẽ 1 đường cong TUỲ Ý qua các điểm mốc — dùng để tái tạo ĐÚNG hình
// dạng piecewise của keyframe (không phải xấp xỉ bằng cubic-bezier) nhưng dưới dạng `transition`, thứ
// TỰ ĐỘNG chạy NGƯỢC LẠI khi target đổi chiều (browser tự nội suy lại từ vị trí hiện tại tới đích mới
// bằng ĐÚNG easing này) — vì đường cong này đối xứng điểm quanh (0.5, 0.5) (pha tăng tốc = ảnh gương
// pha giảm tốc), chạy ngược cho ra ĐÚNG cảm giác "y hệt lúc vào, chỉ đảo chiều" mà không cần định
// nghĩa animation "lùi" riêng cho từng effect.
const SETTLE_DURATION_MS = 700;
const SETTLE_EASING = "linear(0, 0.0556 10%, 0.9444 90%, 1)";
// lift chỉ transition `transform` (không dùng transform-origin).
const LIFT_TRANSITION = `transform ${SETTLE_DURATION_MS}ms ${SETTLE_EASING}`;
// scaleUp PHẢI transition CẢ `transform-origin` CÙNG `transform` (điểm neo có thể lệch tâm) — thiếu 1
// trong 2 gây "nhảy" vị trí giữa chừng, xem ghi chú tại nơi gọi trong PrizeImageView.tsx.
const SCALE_UP_TRANSITION = `transform ${SETTLE_DURATION_MS}ms ${SETTLE_EASING}, transform-origin ${SETTLE_DURATION_MS}ms ${SETTLE_EASING}`;

// Ảnh + kích thước khung (box) THẬT để tính neo Scale Up bám đúng pixel hiển thị — xem đoạn
// "Hướng 'trồi tới'..." bên dưới. `boxWidth`/`boxHeight` chỉ cần ĐÚNG TỈ LỆ (không cần đúng pixel màn
// hình thật — xem doc-comment boxFractionToImageFraction trong pixelAlphaHitTest.ts), nên truyền
// thẳng LandingComponent.width/height (Prize Image) hoặc 1:1 (Prize Gallery — mỗi ô LUÔN vuông,
// "aspect-square") đều được, không cần đo DOM thật.
export interface PrizeAnchorImageContext {
  src: string | null;
  boxWidth: number;
  boxHeight: number;
  fit: "cover" | "contain" | "stretch";
}

// Toạ độ THẬT SỰ của điểm "Direction" (kéo-thả trên canvas Builder cùng lúc với điểm neo, xem
// ScaleAnchorOverlay.tsx) — landing lưu TRƯỚC KHI có field này (bản chỉ có điểm neo + ô nhập số "Zoom
// amount" cũ, xem doc-comment PrizeGroupEffect trong types.ts) không có `handleX/handleY` trong JSON
// đã lưu dù TypeScript khai báo bắt buộc, đọc thẳng ra `undefined` ở runtime — PHẢI tự suy ra 1 điểm
// mặc định HỢP LÝ thay vì rơi thẳng về DEFAULT_PRIZE_GROUP_EFFECT (sẽ làm % zoom cũ người dùng đã
// chỉnh tay đột ngột đổi khác khi mở lại landing cũ): dùng CHÍNH `size` cũ làm khoảng cách (giữ đúng %
// zoom đã cấu hình), đặt theo hướng LÊN TRÊN so với điểm neo hiện tại (không có hướng cũ nào để tái sử
// dụng — góc không ảnh hưởng gì tới CSS thật, xem doc-comment PrizeGroupEffect), rồi kẹp lại trong
// khung 0-100.
export function resolveScaleHandle(config: PrizeGroupEffect): { x: number; y: number } {
  if (config.handleX !== undefined && config.handleY !== undefined) {
    return { x: config.handleX, y: config.handleY };
  }
  const fallbackDistance = config.size ?? DEFAULT_PRIZE_GROUP_EFFECT.size;
  return {
    x: config.directionX,
    y: Math.min(100, Math.max(0, config.directionY - fallbackDistance)),
  };
}

// Tính transform/animation cho 1 effect thuộc nhóm transform-category, ĐÚNG theo `mode`:
//   - "persistent" (When Select/Out of Stock): scaleUp VÀ lift ĐỀU set qua `transform` INLINE (không
//     `className`) + `transition` RIÊNG (`SCALE_UP_TRANSITION`/`LIFT_TRANSITION` ở trên, CÙNG easing
//     `SETTLE_EASING` 700ms) — để BẬT (chọn) và TẮT (bỏ chọn) đều chạy CÙNG 1 kiểu chuyển động, tạo
//     cảm giác tắt là "lượt bật chạy ngược lại" (xem doc-comment SETTLE_EASING phía trên). Effect nào
//     KHÔNG tự set `transition` (hiện chỉ còn bounce/pulse/shake, nhưng chúng dùng `className`/"-loop"
//     LẶP vô hạn nên không cần) rơi về fallback chung 150ms trong PrizeImageView.tsx.
//   - "oneshot" (When Click/Won): scaleUp chạy 1 "cú nảy" rồi TRỞ VỀ trung tính (class
//     "prize-fx-scaleUp-once") — không đứng yên ở mức đã cấu hình, vì đây là 1 khoảnh khắc thoáng qua,
//     không phải trạng thái; bounce/pulse/shake chạy ĐÚNG 1 lượt rồi cũng về trung tính (class "-once").
//     lift LẠI là NGOẠI LỆ — "cú di chuyển" ĐÍCH THỊ là hiệu ứng (không phải 1 cú nảy rồi về gốc), nên
//     oneshot DỪNG LẠI ở vị trí đích, dùng class `prize-fx-lift-once` (keyframe `prize-fx-lift-move`
//     trong landingEffects.css, CÙNG hình dạng 3 pha với `SETTLE_EASING` ở trên — chỉ khác cách biểu
//     diễn: keyframe cho 1 lượt animate rồi đứng yên, không có khái niệm "tắt" vì oneshot chỉ chạy
//     ĐÚNG 1 lần theo `key` remount mỗi lượt thắng mới, xem doc-comment justWon trong PrizeImageView.tsx).
// `effect === "none"` hoặc thuộc overlay-category → trả object rỗng (không áp dụng gì ở đây).
// `anchorImage` CHỈ cần cho scaleUp persistent (bám điểm ảnh thật, xem bên dưới) — bỏ trống ở mọi call
// site khác (lift/bounce/pulse/shake không dùng, và Motion group không bao giờ là scaleUp).
export function computePrizeTransform(
  config: PrizeGroupEffect,
  mode: PrizeEffectRenderMode,
  anchorImage?: PrizeAnchorImageContext
): PrizeTransform {
  const { effect, size, directionX, directionY, handleX, handleY } = config;
  if (!isTransformEffect(effect)) return {};

  if (effect === "scaleUp") {
    // % phóng to thêm giờ SUY RA từ khoảng cách điểm neo (directionX/Y) tới điểm "Direction"
    // (handleX/Y) — thay hẳn ô nhập số "Zoom amount" cũ, xem doc-comment PrizeGroupEffect trong
    // types.ts. Đơn vị khoảng cách CHÍNH LÀ % (cùng hệ 0-100 với toạ độ), nên dùng thẳng không cần quy
    // đổi thêm — kéo Direction ra xa gấp đôi thì zoom gấp đôi.
    const handle = resolveScaleHandle(config);
    const scaleFraction = Math.hypot(handle.x - directionX, handle.y - directionY) / 100;
    if (mode === "persistent") {
      // directionX/Y giờ là ĐÚNG toạ độ điểm neo (kéo-thả trực tiếp trên ảnh thật ở ScaleAnchorPicker.tsx,
      // xem doc-comment PrizeGroupEffect trong types.ts) — dùng THẲNG, không nghịch đảo. Điểm neo người
      // dùng thả có thể vẫn rơi đúng vào vùng TRONG SUỐT của PNG ngay sát rìa chủ thể (mắt nhìn tưởng
      // trên chủ thể nhưng thật ra ngoài viền) — `nearestOpaqueBoxFraction` kéo nó về ĐÚNG pixel hiển
      // thị gần nhất trước khi dùng làm transform-origin, xem pixelAlphaHitTest.ts.
      const rawOriginX = directionX / 100;
      const rawOriginY = directionY / 100;
      const origin = anchorImage
        ? nearestOpaqueBoxFraction(anchorImage.src, rawOriginX, rawOriginY, anchorImage.boxWidth, anchorImage.boxHeight, anchorImage.fit)
        : { x: rawOriginX, y: rawOriginY };
      return {
        transform: `scale(${1 + scaleFraction})`,
        transformOrigin: `${origin.x * 100}% ${origin.y * 100}%`,
        transition: SCALE_UP_TRANSITION,
      };
    }
    return { className: "prize-fx-scaleUp-once", cssVars: { "--prize-fx-scale": String(scaleFraction) } };
  }

  if (effect === "lift") {
    // Hướng + mức lift giờ tính từ khoảng cách handleX/Y (điểm "Direction", kéo-thả trên canvas
    // Builder) tới ĐIỂM CỐ ĐỊNH — LUÔN chính giữa khung (50,50 box-fraction, KHÔNG dời được như điểm
    // neo Scale Up, không bám pixel), xem doc-comment PrizeGroupEffect trong types.ts. Không còn dùng
    // directionX/Y/size (dial tròn cũ) — kéo xa 1 đơn vị % thì dịch 1px, cùng quy ước 1:1 đã dùng cho
    // % zoom của Scale Up.
    const dx = handleX - 50;
    const dy = handleY - 50;
    if (mode === "persistent") {
      // `transform` INLINE (không `className`) — xem doc-comment LIFT_TRANSITION/computePrizeTransform
      // phía trên: để wrapper tự transition CẢ lúc bật lẫn lúc tắt bằng CHÍNH easing này, thay vì chỉ
      // animate lúc bật (className/keyframe) rồi tắt tức thì không animation.
      return { transform: `translate(${dx}px, ${dy}px)`, transition: LIFT_TRANSITION };
    }
    return { className: "prize-fx-lift-once", cssVars: { "--prize-fx-dx": `${dx}px`, "--prize-fx-dy": `${dy}px` } };
  }

  const suffix = mode === "persistent" ? "loop" : "once";
  if (effect === "pulse") {
    return { className: `prize-fx-pulse-${suffix}`, cssVars: { "--prize-fx-scale": String(size / 100) } };
  }
  // bounce / shake
  return { className: `prize-fx-${effect}-${suffix}`, cssVars: { "--prize-fx-px": `${size}px` } };
}

// CSS custom property không nằm trong kiểu CSSProperties chuẩn — cast tối thiểu ở ĐÚNG 1 chỗ này để
// gọi nơi khác không cần biết tới việc ép kiểu, chỉ cần spread cssVars thẳng vào style object.
export function cssVarsToStyle(cssVars: Record<string, string> | undefined): CSSProperties {
  return (cssVars ?? {}) as CSSProperties;
}

export interface ResolvedGroupSlot {
  config: PrizeGroupEffect;
  mode: PrizeEffectRenderMode;
  // Chỉ có ở oneshot — dùng làm `key` remount (xem doc-comment resolvePrizeEffects bên dưới).
  key?: string;
}

export interface ResolvedPrizeEffects {
  // Focus/Motion đều thuộc transform-category → CHỈ 1 được thắng mỗi nhóm (oneshot thắng persistent
  // nếu cả 2 cùng lúc active và cùng KHÁC "none" — edge case hiếm, xem doc-comment
  // computePrizeTransform ở trên). null = nhóm đó không có effect nào active.
  focus: ResolvedGroupSlot | null;
  motion: ResolvedGroupSlot | null;
  // Highlight là overlay-category → XẾP CHỒNG được, nên giữ CẢ HAI (không winner-take-all như 2 nhóm
  // trên) — PrizeEffectOverlay tự vẽ riêng từng lớp, không đụng transform của ảnh gốc.
  highlightPersistent: PrizeGroupEffect | null;
  highlightOneshot: { config: PrizeGroupEffect; key: string } | null;
}

// Gộp cấu hình của giai đoạn PERSISTENT đang active (vd onSelect/onHover/onOutOfStock — component cha
// tự chọn ĐÚNG 1 stage theo độ ưu tiên của nó, xem PrizeImageView.tsx) với giai đoạn ONESHOT đang active
// (chỉ có thể là onWon, kèm `key` remount duy nhất — xem doc-comment justWon trong PrizeImageView.tsx)
// thành 1 bộ effect THẬT SỰ sẽ vẽ, theo ĐÚNG 3 nhóm độc lập (xem doc-comment PrizeStageEffect trong
// types.ts) — dùng ở PrizeImageView.tsx.
// Landing lưu TRƯỚC KHI tách Focus/Highlight/Motion (bản flat PrizeStageEffect cũ — {effect,color,size,
// directionX,directionY} thẳng ở gốc, KHÔNG có `.focus`/`.highlight`/`.motion`) vẫn có thể còn trong DB
// — `onSelect`/`onWon`/... KHÔNG `undefined` (nên fallback `?? DEFAULT_PRIZE_STAGE_EFFECT` ở
// PrizeImageView.tsx không bắt được ca này), nhưng đọc thẳng `.focus`/`.highlight`
// trên nó ra `undefined` — PHẢI fallback riêng ở ĐÚNG các điểm đọc bên dưới, thiếu bước này gây crash
// trắng màn hình ngay khi có stage nào đó active (đã gặp thật: `stage.highlight.effect` ném lỗi vì
// `stage.highlight` là `undefined`, kể cả lúc Draw vừa trả về người trúng — onWon activate ngay lập tức).
function readGroup(stage: PrizeStageEffect | null | undefined, key: "focus" | "highlight" | "motion"): PrizeGroupEffect {
  return stage?.[key] ?? DEFAULT_PRIZE_GROUP_EFFECT;
}

export function resolvePrizeEffects(
  persistentStage: PrizeStageEffect | null,
  oneshotStage: { stage: PrizeStageEffect; key: string } | null,
): ResolvedPrizeEffects {
  function winner(key: "focus" | "motion"): ResolvedGroupSlot | null {
    const oneshotGroup = oneshotStage ? readGroup(oneshotStage.stage, key) : null;
    if (oneshotGroup && oneshotGroup.effect !== "none") {
      return { config: oneshotGroup, mode: "oneshot", key: oneshotStage!.key };
    }
    const persistentGroup = persistentStage ? readGroup(persistentStage, key) : null;
    if (persistentGroup && persistentGroup.effect !== "none") {
      return { config: persistentGroup, mode: "persistent" };
    }
    return null;
  }

  const highlightPersistentGroup = persistentStage ? readGroup(persistentStage, "highlight") : null;
  const highlightPersistent = highlightPersistentGroup && highlightPersistentGroup.effect !== "none" ? highlightPersistentGroup : null;

  const highlightOneshotGroup = oneshotStage ? readGroup(oneshotStage.stage, "highlight") : null;
  const highlightOneshot =
    highlightOneshotGroup && highlightOneshotGroup.effect !== "none"
      ? { config: highlightOneshotGroup, key: oneshotStage!.key }
      : null;

  return { focus: winner("focus"), motion: winner("motion"), highlightPersistent, highlightOneshot };
}
