import { useEffect, useRef, useState } from "react";
import { DEFAULT_PRIZE_STAGE_EFFECT, DrawSequenceActions, LandingData, PrizeImageComponent } from "@/lib/landing/types";
import PrizeEffectOverlay from "./PrizeEffectOverlay";
import { ensureAlphaLoaded } from "./pixelAlphaHitTest";
import {
  computePrizeTransform,
  computeScaleFraction,
  computeSpotlightClipPath,
  cssVarsToStyle,
  resolvePrizeEffects,
} from "./prizeEffectTransform";
import { registerPrizeHitTarget } from "./prizeHitCoordinator";

// Khoảng dư (12%) luôn cộng thêm vào kích thước elip Spotlight NGOÀI mức zoom
// `activeFocusScaleFraction` (nếu onSelect đang scaleUp) — xem doc-comment tại nơi dùng
// (`coverFraction`) trong JSX bên dưới. Mục đích DUY NHẤT: đảm bảo ảnh LUÔN nằm gọn trong elip, dư ra
// 1 chút thay vì khớp pixel-đúng-bằng (dễ vỡ nếu tính sai 1 ly, hoặc anchor scaleUp lệch tâm — xem
// doc-comment activeFocusScaleFraction).
const SPOTLIGHT_COVER_MARGIN = 0.12;

// LUÔN hiện đúng 1 giải CỐ ĐỊNH do người dùng chọn (props.prizeId), không đổi theo kết quả quay. Đặt
// nhiều instance rải khắp landing (mỗi cái tự do vị trí/kích thước khớp artwork nền) để mỗi ảnh đại
// diện ĐÚNG 1 giải — không sinh thêm ảnh theo quantity của giải. LUÔN click được để "select prize to
// draw" (không có tuỳ chọn tắt — đây CHÍNH LÀ lý do component này tồn tại). Dùng
// `sequence.selectedPrizeId`/`togglePrizeSelection`/`notifyOutOfStock` đã có ở useDrawSequence.ts.
//
// 4 giai đoạn tương tác (PrizeInteractions, xem types.ts) — 2 KIỂU CHẠY khác nhau:
//   - onHover (suốt lúc di chuột gần/vào, CHƯA chọn) / onSelect (suốt lúc là giải ĐANG chọn) /
//     onOutOfStock (suốt lúc hết hàng/không active) → PERSISTENT, chạy liên tục suốt trạng thái, ưu
//     tiên onOutOfStock > onSelect > onHover.
//   - onWon (đúng lúc Wheel VỪA TRẢ VỀ người trúng giải này, KHÔNG đợi Confirm) → ONESHOT duy nhất
//     còn lại, chạy đúng 1 lần rồi tắt.
// Mỗi giai đoạn GỘP 3 nhóm ĐỘC LẬP (Focus/Highlight/Motion, xem PrizeStageEffect trong types.ts) — có
// thể bật ĐỒNG THỜI cả 3 (vd vừa scaleUp vừa glow), chỉ TRONG 1 nhóm mới giới hạn đúng 1 effect.
// "overlay-category" (Highlight: glow/sweep/dim, vẽ ở PrizeEffectOverlay.tsx — spotlight CŨNG thuộc
// nhóm này nhưng vẽ RIÊNG ngay trong file này, xem đoạn `spotlightActive` bên dưới) XẾP CHỒNG thoải
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
  const { fit, borderRadius, prizeId } = component.props;
  // Landing lưu TRƯỚC KHI có hệ 4-giai-đoạn này không có 4 field object dưới đây trong JSON đã lưu dù
  // TypeScript khai báo bắt buộc — PHẢI fallback, xem doc-comment DEFAULT_PRIZE_STAGE_EFFECT trong
  // types.ts (thiếu bước này crash trắng màn hình ngay khi mở Properties Panel của prize cũ).
  const onHover = component.props.onHover ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onSelect = component.props.onSelect ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onWon = component.props.onWon ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onOutOfStock = component.props.onOutOfStock ?? DEFAULT_PRIZE_STAGE_EFFECT;
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

  // Spotlight (xem doc-comment PrizeEffectName trong types.ts) — KHÔNG vẽ qua PrizeEffectOverlay.tsx
  // như glow/sweep/dim (effect này cần component.x/y/width/height để kéo nón lên tận đỉnh canvas, dữ
  // liệu component đó không có sẵn ở PrizeEffectOverlay.tsx) — đọc TRỰC TIẾP
  // `resolved.highlightPersistent`/`highlightOneshot` để biết stage nào (nếu có) đang chọn "spotlight"
  // cho Highlight, GENERALIZE cho CẢ 4 giai đoạn (trước đây gắn cứng CHỈ `onWon` qua field
  // `wonAmbientEffect` riêng, xem git history) — oneshot ưu tiên hơn persistent nếu CẢ 2 cùng chọn
  // spotlight lúc trùng nhau (đồng nhất với cách `winner()` ưu tiên oneshot trong resolvePrizeEffects,
  // dù về mặt hiển thị 2 lớp KHÔNG loại trừ nhau như glow/sweep — chỉ ảnh hưởng Delay dùng của config
  // nào). HIỆN SUỐT lúc active còn đúng, chỉ trễ đúng `delayMs` lúc BẮT ĐẦU hiện — tắt NGAY (không
  // delay) khi hết active (Reset/Redraw/đổi trạng thái), không cần state máy phức tạp như oneshot
  // thường (Focus/Highlight/Motion khác).
  const spotlightOneshot = resolved.highlightOneshot?.config.effect === "spotlight" ? resolved.highlightOneshot : null;
  const spotlightPersistent =
    !spotlightOneshot && resolved.highlightPersistent?.effect === "spotlight" ? resolved.highlightPersistent : null;
  const spotlightActive = !!spotlightOneshot || !!spotlightPersistent;
  const spotlightDelayMs = spotlightOneshot?.config.delayMs ?? spotlightPersistent?.delayMs ?? 0;
  // Key đổi ĐÚNG 1 lần mỗi khi có 1 lượt spotlight MỚI cần chạy lại delay từ đầu — oneshot dùng `key`
  // remount riêng (mỗi lượt thắng mới, kể cả trúng LẠI đúng giải đó ở Multiple Draw); persistent chỉ
  // cần biết "vừa CHUYỂN sang active" (bật/tắt tức thì theo trạng thái khi vẫn đứng yên "persistent",
  // xem effect bên dưới).
  const spotlightTriggerKey = spotlightOneshot ? `oneshot:${spotlightOneshot.key}` : spotlightActive ? "persistent" : "off";
  const [spotlightOn, setSpotlightOn] = useState(false);
  useEffect(() => {
    if (!spotlightActive) {
      setSpotlightOn(false);
      return;
    }
    const timer = setTimeout(() => setSpotlightOn(true), Math.max(0, spotlightDelayMs));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotlightTriggerKey]);

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
  // % zoom Focus ĐANG active (vd onSelect vẫn giữ scaleUp SUỐT lúc `selected` — không tự tắt lúc vừa
  // thắng, `selectedPrizeId` chỉ đổi khi người vận hành CHỦ ĐỘNG bấm chọn giải khác/bỏ chọn) — CHỈ tính
  // cho "persistent" (oneshot scaleUp là 1 cú nảy thoáng qua rồi TRỞ VỀ trung tính, không đứng yên ở
  // mức đã cấu hình nên không cần bù, xem doc-comment computePrizeTransform). Dùng để nới rộng đáy
  // Spotlight bên dưới cho khớp kích thước ảnh THẬT đang hiện, không phải kích thước khung gốc tĩnh —
  // xấp xỉ ĐÚNG TUYỆT ĐỐI khi neo zoom ở giữa (mặc định của onSelect, xem defaultPrizeStage trong
  // componentRegistry.ts), hơi lệch nếu người dùng tự kéo neo ra xa tâm — chấp nhận được, còn hơn hẳn
  // không bù gì cả.
  const activeFocusScaleFraction =
    resolved.focus?.mode === "persistent" && resolved.focus.config.effect === "scaleUp"
      ? computeScaleFraction(resolved.focus.config)
      : 0;

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
        // Appearance "Disappear" (xem PrizeStageEffect.appearance trong types.ts) tắt luôn tương tác —
        // ảnh đã biến mất thì không còn gì để bấm chọn. Độ tối lúc hết hàng KHÔNG còn `filter:
        // brightness()` áp lên CẢ khung ở đây nữa — giờ là effect "dim" của Highlight (mặc định
        // `onOutOfStock` = Dim 58%, xem componentRegistry.ts), vẽ qua PrizeEffectOverlay.tsx như
        // glow/sweep, xuống dưới cùng resolved.highlightPersistent.
        pointerEvents: interactive && !resolved.hidden ? "auto" : undefined,
        transition: "opacity 200ms ease-out",
        opacity: resolved.hidden ? 0 : 1,
      }}
    >
      {/* Spotlight — TRƯỚC wrapper Focus trong DOM và KHÔNG có z-index riêng (trước đây `z-20` render
          ĐÈ LÊN TRÊN ảnh, đoạn nón/đáy elip trùm lên đúng phần ảnh sản phẩm làm ảnh bị rửa trắng/mờ đi
          — bug đã gặp thật). Đặt TRƯỚC (DOM order mặc định = vẽ trước = nằm DƯỚI các sibling sau nó)
          để ảnh sản phẩm (wrapper Focus, vẽ SAU) tự nhiên đè lên trên đúng phần chồng lấn — chỗ ảnh CÓ
          pixel (opaque) che kín nón, giữ ảnh rõ nét 100%; chỗ ảnh KHÔNG có pixel (PNG trong suốt quanh
          sản phẩm) hoặc ở NGOÀI khung ảnh (đoạn nón phía trên, giữa nguồn sáng và sản phẩm) vẫn hiện
          đúng, không đổi gì. KHÁC hẳn mọi overlay khác trong file này: vượt ra khỏi khung
          x/y/width/height CỦA CHÍNH component này — `top: -component.y` kéo nón từ ĐỈNH CANVAS (y=0
          tuyệt đối, không phải đỉnh khung Prize Image) xuống ĐÚNG tới đáy khung Prize — canvas ngoài
          cùng (LandingRenderer.tsx) không `overflow: hidden` phần dưới y=0 nên phần vượt lên trên
          KHÔNG bị cắt mất. Đáy nón (elip) PHẢI to hơn hẳn khung ảnh THẬT ĐANG HIỆN, không phải khớp
          SÁT — `SPOTLIGHT_COVER_MARGIN` (dưới đây) cộng thêm 1 khoảng dư ĐỀU cả 2 chiều để ảnh LUÔN
          nằm gọn trong elip, không tràn ra ngoài (đã gặp thật lúc onSelect đang scaleUp: ảnh phóng to
          nhưng trước đây CHỈ bù `width` theo `activeFocusScaleFraction`, quên bù `height` — ảnh cao
          hơn tràn thẳng ra dưới đáy elip cũ, xem `spotlightHeight` bên dưới bù CẢ 2 chiều bằng đúng 1
          công thức, cộng thêm margin cho chắc thay vì khớp pixel-đúng-bằng dễ vỡ lại nếu tính sai 1
          ly). Đáy nón hình ELIP (không phải đường thẳng ngang) — xem doc-comment
          computeSpotlightClipPath trong prizeEffectTransform.ts. Phong cách (màu/hình nón/độ mờ) CỐ
          ĐỊNH trong code — xem doc-comment PrizeEffectName trong types.ts cho lý do không phơi ra
          Properties Panel. Render theo `spotlightActive` (khác `spotlightOn` — GẮN LIỀN với stage nào
          đang thật sự chọn Highlight = Spotlight, xem đoạn tính ở trên), `opacity` mới theo
          `spotlightOn` để transition mượt lúc bật/tắt thay vì mount/unmount đột ngột trong ĐÚNG lúc
          effect vẫn đang active — `pointer-events: none` để không chặn click chọn giải. */}
      {spotlightActive &&
        (() => {
          // Khoảng dư CỐ ĐỊNH (12%) cộng vào CẢ WIDTH LẪN HEIGHT, ĐÈ LÊN TRÊN
          // `activeFocusScaleFraction` (mức zoom onSelect đang active, nếu có) — coi như 1 mức "zoom"
          // bù thêm, tái dùng NGUYÊN công thức tính left/width đã có cho `activeFocusScaleFraction`
          // (giả định ảnh phóng to ĐỀU quanh tâm — xem doc-comment activeFocusScaleFraction ở trên,
          // cùng 1 xấp xỉ, cùng mức chấp nhận được) thay vì tự nghĩ công thức margin riêng.
          const coverFraction = activeFocusScaleFraction + SPOTLIGHT_COVER_MARGIN;
          const spotlightWidth = component.width * (1 + coverFraction);
          // Bù chiều CAO y hệt chiều RỘNG: ảnh phóng to/thu nhỏ ĐỀU quanh tâm nên nửa phần "dư" nằm
          // TRÊN mép gốc, nửa nằm DƯỚI — nửa DƯỚI mới cần cộng thêm vào `spotlightHeight` (đẩy đáy
          // elip xuống thấp hơn), nửa TRÊN đã nằm gọn trong khoảng `-component.y` kéo lên tận đỉnh
          // canvas rồi nên không cần bù riêng.
          const spotlightHeight = component.y + component.height + (component.height * coverFraction) / 2;
          return (
            <div
              className="pointer-events-none absolute"
              style={{
                top: -component.y,
                left: (-component.width * coverFraction) / 2,
                width: spotlightWidth,
                height: spotlightHeight,
                opacity: spotlightOn ? 1 : 0,
                transition: "opacity 400ms ease-out",
                // Đáy ELIP (không phải đường thẳng ngang) — xem doc-comment computeSpotlightClipPath
                // trong prizeEffectTransform.ts, `clip-path: path()` cần toạ độ PIXEL thật nên PHẢI
                // truyền đúng `spotlightWidth`/`spotlightHeight` (px) đang dùng cho chính `width`/
                // `height` ở trên, không phải suy lại theo %.
                clipPath: computeSpotlightClipPath(spotlightWidth, spotlightHeight),
                background: "linear-gradient(to bottom, rgba(255,255,255,0.6), rgba(255,255,255,0.36))",
                filter: "blur(22px)",
              }}
            />
          );
        })()}
      {/* Wrapper Focus — chỉ chiếm transform của NHÓM Focus (scaleUp/lift), `key` remount lúc oneshot
          để replay đúng lượt Multiple Draw dù cùng 1 effect (xem resolvePrizeEffects). `isolate` mở 1
          stacking context RIÊNG cho khung này — bắt buộc để z-index âm của lớp glow (xem
          PrizeEffectOverlay.tsx, `-z-10` đặt lớp glow XUỐNG DƯỚI ảnh thật để chỉ còn outer glow, không
          đè sáng lên chính ảnh) chỉ "chìm xuống" đúng bên trong khung này, không lỡ chìm xuống dưới
          những component/nền khác ở xa hơn trong cây render. */}
      <div
        key={resolved.focus?.mode === "oneshot" ? resolved.focus.key : undefined}
        className={`isolate relative flex h-full w-full items-center justify-center ${focusTransform.className ?? ""}`}
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
          // `relative` (thêm riêng cho Spotlight bên dưới) — để 2 lớp sáng/tối "dán" ĐÚNG theo ảnh kể
          // cả lúc Motion đang lệch vị trí (bounce/shake), không neo nhầm theo wrapper Focus tĩnh hơn.
          <div
            key={resolved.motion?.mode === "oneshot" ? resolved.motion.key : undefined}
            className={`relative h-full w-full ${motionTransform.className ?? ""}`}
            style={cssVarsToStyle(motionTransform.cssVars)}
          >
            <img ref={imgRef} src={src} alt="" className="h-full w-full" style={{ objectFit: fit === "stretch" ? "fill" : fit, borderRadius }} />
            {/* Spotlight — NỬA TRÊN của chính ảnh (không phải khung) sáng hơn, NỬA DƯỚI giữ
                NGUYÊN độ sáng gốc — chia ĐÔI rõ ràng theo yêu cầu (không phải tối dần TỪ ĐỈNH ảnh như
                bản trước), mô phỏng ánh sáng chiếu thẳng từ trên xuống làm mặt trên sản phẩm hắt sáng.
                Giữ NGUYÊN mức sáng (0%-45%) rồi mới nhạt dần xuống 0 ở 55% — dải chuyển 45%-55% CHỈ để
                tránh 1 đường cắt cứng thấy rõ pixel, không phải gradient tăng dần từ đỉnh. Dùng kỹ
                thuật mask-image theo alpha của ảnh (giống PrizeEffectOverlay.tsx's "sweep") để CHỈ hiện
                trong silhouette ảnh (PNG trong suốt), không tràn ra ngoài thành 1 khối chữ nhật xấu.
                `mixBlendMode: soft-light` — cộng sáng nhẹ, không rửa trôi chi tiết như "screen". Bóng
                đổ ở chân ảnh giờ tách RIÊNG thành 1 lớp `drop-shadow` LAN RA NGOÀI biên ảnh (xem khối
                JSX ngay sau `{src ? (...) : (...)}` bên dưới, kiểu "outer glow" của PrizeEffectOverlay
                nhưng lệch xuống dưới + màu tối), không còn là gradient tối BÊN TRONG ảnh như bản trước
                (không thấy rõ, đã gặp thật — user báo "chưa nhìn thấy đổ bóng luôn"). */}
            {spotlightActive && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  borderRadius,
                  opacity: spotlightOn ? 1 : 0,
                  transition: "opacity 400ms ease-out",
                  WebkitMaskImage: `url("${src}")`,
                  maskImage: `url("${src}")`,
                  WebkitMaskSize: fit === "stretch" ? "100% 100%" : fit,
                  maskSize: fit === "stretch" ? "100% 100%" : fit,
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  background: "linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0) 55%)",
                  mixBlendMode: "soft-light",
                }}
              />
            )}
          </div>
        ) : (
          <span className="text-xs text-base-500">No image</span>
        )}
        {/* Bóng đổ Spotlight — 1 bản SAO ảnh phủ `drop-shadow` dịch XUỐNG DƯỚI, đặt `-z-10` NHƯ "glow"
            (xem PrizeEffectOverlay.tsx's `-z-10` comment) để bản sao bị chính ảnh thật phía trên che
            kín hoàn toàn — CHỈ còn lộ ra đúng phần shadow LAN RA NGOÀI biên dưới ảnh (do offset dy +
            blur), đúng cảm giác "stroke tối đổ xuống dưới" thay vì tối đều bên trong ảnh. */}
        {src && spotlightActive && (
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ opacity: spotlightOn ? 1 : 0, transition: "opacity 400ms ease-out" }}
          >
            <img
              src={src}
              alt=""
              className="h-full w-full"
              style={{
                objectFit: fit === "stretch" ? "fill" : fit,
                filter: "drop-shadow(0 16px 14px rgba(15,10,5,0.65))",
              }}
            />
          </div>
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
