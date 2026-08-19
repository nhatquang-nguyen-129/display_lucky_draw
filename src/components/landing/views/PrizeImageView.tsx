import { useEffect, useRef, useState } from "react";
import { DEFAULT_FIREWORK_EFFECT, DEFAULT_PRIZE_STAGE_EFFECT, DrawSequenceActions, LandingData, PrizeImageComponent } from "@/lib/landing/types";
import { launchFirework } from "./fireworkCoordinator";
import PrizeEffectOverlay from "./PrizeEffectOverlay";
import { ensureAlphaLoaded } from "./pixelAlphaHitTest";
import { computePrizeTransform, cssVarsToStyle, resolvePrizeEffects } from "./prizeEffectTransform";
import { registerPrizeHitTarget } from "./prizeHitCoordinator";

// LUÔN hiện đúng 1 giải CỐ ĐỊNH do người dùng chọn (props.prizeId), không đổi theo kết quả quay. Đặt
// nhiều instance rải khắp landing (mỗi cái tự do vị trí/kích thước khớp artwork nền) để mỗi ảnh đại
// diện ĐÚNG 1 giải — không sinh thêm ảnh theo quantity của giải. LUÔN click được để "select prize to
// draw" (không có tuỳ chọn tắt — đây CHÍNH LÀ lý do component này tồn tại). Dùng
// `sequence.selectedPrizeId`/`togglePrizeSelection`/`notifyOutOfStock` đã có ở useDrawSequence.ts.
//
// 4 giai đoạn tương tác (PrizeInteractions, xem types.ts) — 2 KIỂU CHẠY khác nhau:
//   - onHover (suốt lúc di chuột gần/vào, CHƯA chọn) / onSelect (suốt lúc là giải ĐANG chọn) /
//     onOutOfStock (suốt lúc hết hàng/không active, LAYER THÊM lên trên `outOfStockDimAmount`) →
//     PERSISTENT, chạy liên tục suốt trạng thái, ưu tiên onOutOfStock > onSelect > onHover.
//   - onWon (đúng lúc Wheel VỪA TRẢ VỀ người trúng giải này, KHÔNG đợi Confirm) → ONESHOT duy nhất
//     còn lại, chạy đúng 1 lần rồi tắt.
// Mỗi giai đoạn GỘP 3 nhóm ĐỘC LẬP (Focus/Highlight/Motion, xem PrizeStageEffect trong types.ts) — có
// thể bật ĐỒNG THỜI cả 3 (vd vừa scaleUp vừa glow), chỉ TRONG 1 nhóm mới giới hạn đúng 1 effect.
// "overlay-category" (Highlight: glow/sweep, vẽ ở PrizeEffectOverlay.tsx) XẾP CHỒNG thoải
// mái — kể cả giữa persistent VÀ oneshot đang active cùng lúc (2 lớp overlay riêng, không đụng nhau).
// "transform-category" (Focus: scaleUp/lift; Motion: bounce/pulse/shake, tính ở
// prizeEffectTransform.ts) mỗi nhóm chiếm `transform`/animation của 1 wrapper DOM RIÊNG (Focus ở
// wrapper ngoài, Motion ở wrapper trong bọc ảnh) để 2 nhóm này áp dụng ĐỒNG THỜI được mà không tranh
// chấp cùng 1 thuộc tính `transform` — bên trong CÙNG 1 nhóm, oneshot ưu tiên hơn persistent trong
// đúng thời lượng ngắn của nó nếu trùng nhau (xem resolvePrizeEffects trong prizeEffectTransform.ts).
export default function PrizeImageView({
  component,
  data,
  sequence,
}: {
  component: PrizeImageComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  const { fit, borderRadius, prizeId, dimUnselectedAmount } = component.props;
  // Landing lưu TRƯỚC KHI có hệ 4-giai-đoạn này không có 4 field object dưới đây trong JSON đã lưu dù
  // TypeScript khai báo bắt buộc — PHẢI fallback, xem doc-comment DEFAULT_PRIZE_STAGE_EFFECT trong
  // types.ts (thiếu bước này crash trắng màn hình ngay khi mở Properties Panel của prize cũ).
  const onHover = component.props.onHover ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onSelect = component.props.onSelect ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onWon = component.props.onWon ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onOutOfStock = component.props.onOutOfStock ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const outOfStockDimAmount = component.props.outOfStockDimAmount ?? 58;
  const onWonFirework = component.props.onWonFirework ?? DEFAULT_FIREWORK_EFFECT;
  // Chuột đang ở TRONG khung ảnh này hay không — chỉ có ý nghĩa lúc CHƯA chọn (click chính là hành
  // động CHỌN nên khi đã selected, hover không còn là 1 trạng thái tách biệt cần hiện riêng). Tính
  // theo ĐÚNG pixel alpha của ảnh, và QUA prizeHitCoordinator.ts (không phải onMouseMove/onClick cục
  // bộ ở element này) — ảnh PNG trong suốt đặt CHỒNG box lên nhau (nhiều instance rải khắp landing)
  // nên cần dò lại TOÀN BỘ ngăn xếp phần tử tại điểm chuột mỗi lần, không chỉ mỗi element này tự biết
  // về bản thân nó (xem doc-comment đầu prizeHitCoordinator.ts).
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const boundPrize = data?.prizes.find((p) => p.id === prizeId) ?? null;
  // Không còn fallback riêng — ảnh trình chiếu giờ bắt buộc nhập ở màn Prizes (xem PrizeFormModal.tsx),
  // lấy thẳng đúng ảnh đó. `null` chỉ còn xảy ra khi chưa chọn giải nào cho instance này, hoặc giải đã
  // chọn bị xoá — vẫn hiện "No image" placeholder như cũ cho 2 trường hợp đó (xem JSX bên dưới).
  const src = boundPrize?.display_image ?? null;
  useEffect(() => ensureAlphaLoaded(src), [src]);

  const interactive = !!sequence && !!boundPrize;
  const disabled = interactive && (boundPrize!.remaining <= 0 || boundPrize!.status !== "active");
  // Khoá TẠM THỜI (busy: 1 hành động ghi DB + nạp lại data đang chạy; spinning: Wheel đang quay, giữ
  // nguyên selection cho tới khi quay xong) — KHÁC với `disabled` (hết hàng/không active, tối đi
  // VĨNH VIỄN tới khi có thêm hàng). Locked KHÔNG đổi giao diện (không tối đi) — chỉ tắt tương tác +
  // đổi cursor, đúng cảm giác "tạm dừng".
  const locked = interactive && (sequence!.busy || sequence!.spinning);
  const selected = interactive && sequence!.selectedPrizeId === boundPrize!.id;
  // "Spotlight" — SUỐT lúc Wheel đang quay, giải KHÔNG PHẢI giải đang chọn tự tối đi để làm nổi bật
  // đúng giải đang quay (nhiều instance Prize Image rải khắp trang, xem doc-comment
  // LiveImageProps.dimUnselectedAmount). Loại trừ `disabled` (đã có dim riêng cho hết hàng) và chính
  // `selected` (giải đang chọn luôn giữ nguyên độ sáng, tương phản với những giải bị tối đi).
  const dimmed = interactive && !disabled && !selected && sequence!.spinning && !!sequence!.selectedPrizeId;
  // ĐÚNG giải này VỪA được Wheel trả về (candidate hiện tại chính là giải này) — KHÔNG đợi Confirm.
  // `!sequence.spinning` — candidate được set NGAY khi bấm Draw (xem useDrawSequence.ts's pick()),
  // TRƯỚC KHI Wheel/WinnerName quay/hiện xong (spinning giữ true suốt winnerRevealDelayMs) — thiếu
  // điều kiện này thì oneshot onWon chạy VÀ KẾT THÚC ngay lúc vừa bấm Draw, xong hẳn trước khi người
  // xem kịp nhìn sang Prize Image (bug đã gặp thật: "chưa thấy được hiệu ứng khi won"). Dùng
  // `sequence.candidate.seed` làm key remount cho onWon bên dưới — boolean này KHÔNG tự về false giữa
  // 2 lượt Multiple Draw liên tiếp trên cùng giải (candidate.prizeId không đổi), chỉ `seed` đổi mới
  // báo hiệu "người trúng MỚI".
  const justWon =
    !!sequence && !!boundPrize && !!sequence.candidate && sequence.candidate.prizeId === boundPrize.id && !sequence.spinning;

  // Bắn pháo hoa toàn màn hình (FireworkOverlay.tsx, mount ở PresentMode.tsx) đúng 1 LẦN mỗi lượt
  // thắng mới — dep là `seed` (không phải object `onWonFirework` hay `justWon` không thôi) nên effect
  // chỉ chạy lại khi THẬT SỰ có 1 lượt thắng mới, không chạy lại mỗi lần re-render trong lúc `justWon`
  // vẫn đang true (đúng seed cũ), khớp quy ước "seed = danh tính 1 lượt thắng" đã dùng làm remount key
  // cho scaleUp/glow/... ở JSX bên dưới.
  const fireworkRef = useRef(onWonFirework);
  fireworkRef.current = onWonFirework;
  useEffect(() => {
    if (!justWon || !fireworkRef.current.enabled) return;
    launchFirework(fireworkRef.current);
  }, [justWon, sequence?.candidate?.seed]);

  // Dữ liệu "sống" cho target đăng ký với prizeHitCoordinator.ts — đọc qua ref để callback của nó
  // luôn thấy giá trị MỚI NHẤT mà không cần đăng ký lại (huỷ + tạo lại listener) mỗi lần render, chỉ
  // đăng ký ĐÚNG 1 LẦN cho tới khi `interactive` đổi (xem effect bên dưới).
  const liveRef = useRef({ src, fit, boundPrize, locked, disabled, sequence });
  liveRef.current = { src, fit, boundPrize, locked, disabled, sequence };

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !interactive) return;
    return registerPrizeHitTarget(el, {
      getSrc: () => liveRef.current.src,
      getFit: () => liveRef.current.fit,
      // Không có ảnh thật (placeholder "No image") → fallback về khung của CHÍNH root, coi cả khung
      // đó là "trong ảnh" (không có alpha nào để so, giữ đúng hành vi cũ luôn tương tác được).
      getImgRect: () => imgRef.current?.getBoundingClientRect() ?? rootRef.current?.getBoundingClientRect() ?? null,
      setHover: setHovered,
      onOpaqueClick: () => {
        const live = liveRef.current;
        if (!live.boundPrize || live.locked) return;
        if (live.disabled) {
          live.sequence!.notifyOutOfStock(live.boundPrize.name);
          return;
        }
        live.sequence!.togglePrizeSelection(live.boundPrize.id);
      },
    });
  }, [interactive]);

  // Ưu tiên onOutOfStock > onSelect > onHover khi trùng nhau (vd đang hover 1 giải ĐÃ hết hàng thì
  // hiện onOutOfStock, không phải onHover; đang hover giải ĐANG chọn thì hiện onSelect).
  const hovering = interactive && !disabled && !selected && !locked && hovered;
  const persistentStage = disabled ? onOutOfStock : selected ? onSelect : hovering ? onHover : null;
  const oneshotStage = justWon ? { stage: onWon, key: `won-${sequence!.candidate!.seed}` } : null;
  const resolved = resolvePrizeEffects(persistentStage, oneshotStage);

  // `anchorImage` — CHỈ cần thiết cho Focus (Motion group không bao giờ là scaleUp) — bám neo Scale Up
  // về đúng pixel ảnh thật, xem doc-comment computePrizeTransform trong prizeEffectTransform.ts.
  const focusTransform = resolved.focus
    ? computePrizeTransform(resolved.focus.config, resolved.focus.mode, {
        src,
        boxWidth: component.width,
        boxHeight: component.height,
        fit,
      })
    : {};
  const motionTransform = resolved.motion ? computePrizeTransform(resolved.motion.config, resolved.motion.mode) : {};

  return (
    <div
      ref={rootRef}
      // Nền mờ CHỈ hiện khi KHÔNG có ảnh thật (placeholder "No image") — có ảnh (nhất là PNG đã tách
      // nền, trong suốt) thì tuyệt đối không phủ gì lên trên, giữ đúng nguyên bản ảnh gốc.
      className={`relative h-full w-full ${!src ? "bg-base-800/40" : ""} ${
        !interactive ? "" : locked ? "cursor-default" : "cursor-pointer"
      }`}
      style={{
        borderRadius,
        pointerEvents: interactive ? "auto" : undefined,
        transition: "filter 150ms ease-out",
        filter: disabled
          ? `brightness(${1 - (outOfStockDimAmount ?? 58) / 100})`
          : dimmed
            ? `brightness(${1 - (dimUnselectedAmount ?? 60) / 100})`
            : undefined,
      }}
    >
      {/* Wrapper Focus — chỉ chiếm transform của NHÓM Focus (scaleUp/lift), `key` remount lúc oneshot
          để replay đúng lượt Multiple Draw dù cùng 1 effect (xem resolvePrizeEffects). */}
      <div
        key={resolved.focus?.mode === "oneshot" ? resolved.focus.key : undefined}
        className={`relative flex h-full w-full items-center justify-center ${focusTransform.className ?? ""}`}
        style={{
          transform: focusTransform.transform ?? "scale(1)",
          // `transformOrigin` cũng PHẢI transition CÙNG `transform` — thiếu nó thì lúc scaleUp có
          // hướng (directionX/Y lệch tâm) tắt đi (vd unselect), transform-origin đổi VỀ 50/50 NGAY LẬP
          // TỨC (không animate) trong khi transform vẫn đang chuyển mượt, tạo cảm giác ảnh "nhảy" sang
          // vị trí khác rồi mới thu nhỏ, thay vì thu gọn liên tục đúng từ vị trí hiện tại.
          transformOrigin: focusTransform.transformOrigin,
          // `focusTransform.transition` — CHỈ lift persistent set (xem doc-comment PrizeTransform/
          // LIFT_TRANSITION trong prizeEffectTransform.ts), ghi đè fallback 150ms mặc định bằng đúng
          // nhịp 3 pha khớp animation lúc bật, để BẬT/TẮT chạy CÙNG kiểu, cảm giác tắt là "đảo ngược".
          transition: focusTransform.className ? undefined : (focusTransform.transition ?? "transform 150ms ease-out, transform-origin 150ms ease-out"),
          ...cssVarsToStyle(focusTransform.cssVars),
        }}
      >
        {src ? (
          // Wrapper Motion — chỉ bọc ảnh, chiếm transform của NHÓM Motion (bounce/pulse/shake), tách
          // riêng khỏi wrapper Focus ở trên để 2 nhóm animate ĐỒNG THỜI không tranh chấp `transform`.
          <div
            key={resolved.motion?.mode === "oneshot" ? resolved.motion.key : undefined}
            className={`h-full w-full ${motionTransform.className ?? ""}`}
            style={cssVarsToStyle(motionTransform.cssVars)}
          >
            <img ref={imgRef} src={src} alt="" className="h-full w-full" style={{ objectFit: fit === "stretch" ? "fill" : fit, borderRadius }} />
          </div>
        ) : (
          <span className="text-xs text-base-500">No image</span>
        )}
        {src && resolved.highlightPersistent && (
          <PrizeEffectOverlay config={resolved.highlightPersistent} mode="persistent" imageSrc={src} fit={fit} borderRadius={borderRadius} />
        )}
        {src && resolved.highlightOneshot && (
          <PrizeEffectOverlay
            key={resolved.highlightOneshot.key}
            config={resolved.highlightOneshot.config}
            mode="oneshot"
            imageSrc={src}
            fit={fit}
            borderRadius={borderRadius}
          />
        )}
      </div>
    </div>
  );
}
