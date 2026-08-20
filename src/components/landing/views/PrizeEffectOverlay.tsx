import { PrizeGroupEffect } from "@/lib/landing/types";
import { cssVarsToStyle, isTransformEffect, PrizeEffectRenderMode } from "./prizeEffectTransform";

// Đổi 1 số 0..1 (tỉ lệ alpha) thành 2 ký tự hex nối vào cuối màu hex (vd "#FFCA2D" + "cc" = ~80%
// alpha) — CSS hex-alpha (#RRGGBBAA) chuẩn, dùng cho công thức Glow bên dưới.
function alphaHex(fraction: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
}

// Vẽ 2 effect thuộc nhóm "overlay-category" (glow/sweep — thêm 1 LỚP PHỦ RIÊNG cạnh ảnh, xem
// doc-comment PrizeStageEffect trong types.ts) — KHÁC NHAU về vị trí lớp phủ: glow nằm DƯỚI ảnh thật
// (`-z-10`, chỉ còn lộ ra phần lan RA NGOÀI biên ảnh — outer glow thuần tuý, không đè sáng lên chính
// ảnh) còn sweep nằm TRÊN (ánh sáng quét ngang qua bề mặt, cần che phủ trực tiếp lên ảnh mới đúng cảm
// giác "ánh sáng phản chiếu lướt qua"). Effect thuộc nhóm "transform-category"
// (scaleUp/lift/bounce/pulse/shake) và "none" đều trả `null` ở đây — 2 nhóm đó biến đổi TRỰC TIẾP
// element ảnh thật, tính ở prizeEffectTransform.ts, không qua component này. Từng có thêm "spotlight"
// (đèn sân khấu) — bỏ hẳn sau nhiều vòng thử không ra hướng đi ổn, xem doc-comment PrizeEffectName
// trong types.ts — landing cũ lỡ chọn "spotlight" cho 1 giai đoạn nào đó rơi thẳng về `return null` ở
// cuối file (không khớp "glow" cũng không khớp "sweep"), không crash.
//
// `mode`: "persistent" (When Select/Out of Stock — lặp vô hạn suốt trạng thái) hay "oneshot" (When
// Click/Won — chạy đúng 1 lần rồi đứng yên ở khung cuối). Component cha (PrizeImageView.tsx) chịu
// trách nhiệm MOUNT/UNMOUNT đúng lúc cho "oneshot" (React mount = animation tự chạy từ đầu) —
// component này không tự quản lý timer/key gì.
export default function PrizeEffectOverlay({
  config,
  mode,
  imageSrc,
  fit,
  borderRadius,
}: {
  config: PrizeGroupEffect;
  mode: PrizeEffectRenderMode;
  imageSrc: string;
  fit: "cover" | "contain" | "stretch";
  borderRadius?: number;
}) {
  const { effect, color, size } = config;
  if (effect === "none" || isTransformEffect(effect)) return null;

  const maskSize = fit === "stretch" ? "100% 100%" : fit;
  const maskProps = {
    WebkitMaskImage: `url("${imageSrc}")`,
    maskImage: `url("${imageSrc}")`,
    WebkitMaskSize: maskSize,
    maskSize,
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  } as const;

  if (effect === "glow") {
    // Panel chỉ có ĐÚNG 2 field cho Glow: Color + Size (giữ tối giản theo yêu cầu, không thêm field
    // "Intensity" riêng) — nên `size` (khoảng [4,80], xem SIZE_RANGE trong PrizeEffectPicker.tsx) phải
    // tự gánh CẢ 2 việc: vừa điều khiển độ LAN TOẢ (blur) vừa điều khiển độ RỰC (alpha). Bản chất
    // Gaussian blur của `drop-shadow` khiến blur càng lớn thì đỉnh sáng càng THẤP nếu chỉ tăng blur
    // suông (pha loãng cùng 1 lượng "ánh sáng" ra vùng rộng hơn — lý do tăng Size trước đây không thấy
    // rực hơn) — nên tách LÕI (blur nhỏ CỐ ĐỊNH 3px, alpha giữ gần như đầy, không phụ thuộc size) giữ
    // độ rực sát viền không bị pha loãng, khỏi 2 lớp NGOÀI (blur VÀ alpha đều tăng theo size) lo phần
    // lan xa — kéo 1 thanh trượt Size vẫn cảm nhận rõ "to dần và rực hơn dần" cùng lúc.
    //
    // `-z-10` — lớp glow (1 bản sao ảnh phủ `drop-shadow`) nằm DƯỚI ảnh thật (xem `isolate` ở wrapper
    // Focus trong PrizeImageView.tsx) thay vì đè lên trên như trước — trước đây `mixBlendMode: "screen"`
    // đè LÊN TRÊN ảnh thật khiến chính phần ẢNH BÊN TRONG (không chỉ viền) cũng bị cộng sáng, "rửa
    // trôi" chi tiết (vd ảnh sản phẩm kim loại/sáng màu bị loá trắng, khó nhìn — bug thật đã gặp).
    // Đặt XUỐNG DƯỚI: đúng hình dạng ảnh (cùng silhouette, cùng vị trí) ở lớp glow bị ảnh thật phía
    // trên CHE HẲN — chỉ phần `drop-shadow` lan RA NGOÀI biên ảnh (vùng trong suốt xung quanh) mới còn
    // lộ ra, tức chỉ còn OUTER GLOW thuần tuý, ảnh gốc giữ nguyên 100% độ rõ nét.
    if (mode === "persistent") {
      // `mixBlendMode: "screen"` — ánh sáng CỘNG DỒN vào NỀN phía sau khung ảnh (giờ là thứ DUY NHẤT
      // còn ở dưới lớp glow, sau khi đã chuyển xuống `-z-10`) thay vì đè phẳng — thiếu nó thì alpha cao
      // cỡ nào cũng không "rực" được.
      const glowT = Math.max(0, Math.min(1, (size - 4) / 76));
      const midAlpha = alphaHex(0.5 + glowT * 0.45);
      const outerAlpha = alphaHex(0.22 + glowT * 0.33);
      return (
        <div className="pointer-events-none absolute inset-0 -z-10">
          <img
            src={imageSrc}
            alt=""
            className="prize-select-breathe h-full w-full"
            style={{
              objectFit: fit === "stretch" ? "fill" : fit,
              mixBlendMode: "screen",
              filter: [
                `drop-shadow(0 0 3px ${color})`,
                `drop-shadow(0 0 ${size * 0.9}px ${color}${midAlpha})`,
                `drop-shadow(0 0 ${size * 1.8}px ${color}${outerAlpha})`,
              ].join(" "),
            }}
          />
        </div>
      );
    }
    // Oneshot (When Won) — cùng công thức lõi-cố-định/lan-toả-theo-size VÀ cùng cách đặt `-z-10` xuống
    // dưới ảnh thật ở trên, nhưng chạy qua CSS keyframes (prize-fx-glow-pulse trong landingEffects.css)
    // nên truyền `size` vào bằng custom property thay vì tính filter string trực tiếp ở đây —
    // `currentColor` (từ `color` ở style cha) không tách được alpha riêng theo size như bản persistent,
    // bù lại bằng cách STACK nhiều lớp full-opacity cùng `mixBlendMode: "screen"` (mỗi lớp chồng thêm
    // càng cộng dồn sáng hơn) để size lớn hơn vẫn rực hơn thấy rõ trong đúng 1 nhịp chớp ngắn.
    return (
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ color, ...cssVarsToStyle({ "--prize-fx-glow-size": String(size) }) }}
      >
        <img
          src={imageSrc}
          alt=""
          className="prize-fx-glowPulse h-full w-full"
          style={{ objectFit: fit === "stretch" ? "fill" : fit, borderRadius, mixBlendMode: "screen" }}
        />
      </div>
    );
  }

  if (effect === "sweep") {
    // 1 wrapper DUY NHẤT nhận animation (glow/core bên trong tự trôi theo cùng transform của cha,
    // tránh lệch nhau do 2 lớp khác width). blend-mode "screen" để ánh sáng CỘNG vào màu ảnh bên dưới
    // thay vì sơn đè phẳng lì lên trên. "-loop" nén sweep vào ~28% đầu 1 chu kỳ 3s rồi nghỉ, xem
    // landingEffects.css.
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius, ...maskProps }}>
        <div className={`${mode === "persistent" ? "prize-fx-sweep-loop" : "prize-fx-sweep-wrap"} absolute inset-y-0 left-0 w-2/5`}>
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.35) 45%, rgba(255,255,255,0.35) 55%, transparent 100%)",
              filter: "blur(14px)",
              mixBlendMode: "screen",
            }}
          />
          <div
            className="absolute inset-y-0"
            style={{
              left: "30%",
              width: "40%",
              background:
                "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.9) 45%, rgba(255,255,255,0.9) 55%, transparent 100%)",
              mixBlendMode: "screen",
            }}
          />
        </div>
      </div>
    );
  }

  // Effect không nhận diện được (vd landing cũ lỡ lưu "spotlight" — đã bỏ hẳn, xem doc-comment đầu
  // file) — không vẽ gì thay vì đoán bừa, an toàn hơn crash hay hiện nhầm hiệu ứng khác.
  return null;
}
