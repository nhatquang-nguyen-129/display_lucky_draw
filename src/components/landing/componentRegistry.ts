// Nơi DUY NHẤT "nối dây" 1 loại component vào Palette (kéo-thả) + Canvas (tạo instance mặc định
// khi thả). Thêm loại mới chỉ cần thêm 1 entry ở đây (sau khi đã có type ở lib/landing/types.ts
// và view/panel tương ứng) — xem checklist ở đầu lib/landing/types.ts.

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  LandingComponent,
  LandingComponentType,
  newComponentId,
  PrizeEffectName,
  PrizeGroupEffect,
  PrizeStageEffect,
} from "@/lib/landing/types";

function noGroupEffect(): PrizeGroupEffect {
  return { effect: "none", color: "#FFCA2D", size: 24, directionX: 50, directionY: 50, handleX: 50, handleY: 50, anchorPlaced: false, delayMs: 0 };
}

// Default mới cho 1 giai đoạn tương tác prize (PrizeInteractions, xem types.ts) — "none" = tắt hẳn cả
// 3 nhóm (đúng hành vi mặc định cũ trước khi có hệ effect này). `group`/`effect` (nếu truyền) chỉ bật
// ĐÚNG 1 nhóm, 2 nhóm còn lại giữ "none" — `onSelect` mặc định bật nhóm Focus với "scaleUp" 10% từ
// giữa (handleY lệch 10 đơn vị so với directionY — khoảng cách này CHÍNH LÀ % zoom, xem doc-comment
// PrizeGroupEffect trong types.ts), mô phỏng GẦN NHẤT hành vi zoom-khi-chọn cũ để không gây hụt hẫng
// khi thêm component mới.
function defaultPrizeStage(group?: "focus" | "highlight" | "motion", effect: PrizeEffectName = "none"): PrizeStageEffect {
  const active: PrizeGroupEffect = {
    effect,
    color: "#FFCA2D",
    size: effect === "scaleUp" ? 10 : 24,
    directionX: 50,
    directionY: 50,
    handleX: 50,
    handleY: effect === "scaleUp" ? 40 : 50,
    // false dù ĐÃ có sẵn Anchor/Direction dùng được ngay (10% zoom từ giữa) — cờ này CHỈ đánh dấu đã
    // đi qua đúng luồng click-để-thả chưa (xem doc-comment PrizeGroupEffect trong types.ts), không ảnh
    // hưởng gì tới việc effect có chạy hay không; panel vẫn hiện nút "Drop anchor point" để người dùng
    // chủ động thả lại nếu muốn tuỳ chỉnh trực quan trên canvas.
    anchorPlaced: false,
    delayMs: 0,
  };
  return {
    focus: group === "focus" ? active : noGroupEffect(),
    highlight: group === "highlight" ? active : noGroupEffect(),
    motion: group === "motion" ? active : noGroupEffect(),
    appearance: "none",
  };
}

// Nhóm hiển thị trong ComponentPalette.tsx (menu "Add component") — CHỈ ảnh hưởng thứ tự/cách gom
// nhóm khi kéo-thả. Thứ tự mảng này = thứ tự nhóm hiện trên Palette. "Effects" = hiệu ứng đồ hoạ TỰ
// ĐỨNG (component riêng, vẽ bằng Canvas 2D/CSS — xem docs/landing/effects.md), hiện có Orbit Lights.
// Spotlight KHÔNG thuộc nhóm này — nó là 1 lựa chọn Highlight trong panel Prize Image (xem
// doc-comment PrizeEffectName trong types.ts).
export const CATEGORY_ORDER = ["Basic", "Draw", "Live", "Interactive", "Effects"] as const;
export type ComponentCategory = (typeof CATEGORY_ORDER)[number];

export interface ComponentRegistryEntry {
  label: string;
  description: string;
  category: ComponentCategory;
  defaultWidth: number;
  defaultHeight: number;
  createDefaultProps: () => LandingComponent["props"];
}

export const COMPONENT_REGISTRY: Record<LandingComponentType, ComponentRegistryEntry> = {
  text: {
    label: "Text",
    description: "Static label or heading",
    category: "Basic",
    defaultWidth: 400,
    defaultHeight: 80,
    createDefaultProps: () => ({
      content: "Click to select, edit in the panel",
      fontSize: 32,
      color: "#FFFFFF",
      fontWeight: "normal",
      align: "left",
    }),
  },
  image: {
    label: "Image",
    description: "Logo, banner, or decorative image",
    category: "Basic",
    defaultWidth: 300,
    defaultHeight: 300,
    createDefaultProps: () => ({
      srcDataUrl: null,
      fit: "cover",
      borderRadius: 0,
    }),
  },
  background: {
    label: "Background",
    description: "Full-canvas image (video support planned) — drag to reposition/resize, any area left uncovered stays black",
    category: "Basic",
    defaultWidth: CANVAS_WIDTH,
    defaultHeight: CANVAS_HEIGHT,
    createDefaultProps: () => ({
      srcDataUrl: null,
      fit: "cover",
    }),
  },
  luckyWheel: {
    label: "Lucky Wheel",
    description: "Spinning wheel bound to the Draw Engine",
    category: "Draw",
    defaultWidth: 500,
    defaultHeight: 500,
    createDefaultProps: () => ({
      template: "wheel",
      drawField: "participantId",
      displayField: "name",
      winnerDisplayField: "name",
      maskSensitiveData: false,
      digitCount: 3,
      rollStyle: "flicker",
      // KHÔNG còn dropdown Timing/Effect riêng trong Properties Panel nữa (đơn giản hoá — Panel giờ
      // chỉ còn Duration/Spin style/Style, xem LuckyWheelPanel.tsx) — luôn dùng ĐÚNG 4 giá trị mặc
      // định này cho component MỚI tạo, y hệt cách revealStaggerMs (dòng dưới) đã làm trước đó: landing
      // CŨ đã tự chỉnh tay trước khi bỏ dropdown vẫn giữ nguyên giá trị đã lưu, không bị ép đổi lại.
      reelCardEffect: "pop",
      reelNumberEffect: "bounce",
      revealTiming: "sequential",
      revealStaggerMs: 150,
      landingEffect: "pop",
      fontFamily: "Inter, ui-sans-serif, sans-serif",
      fontColor: "#FFFFFF",
      fontSize: 20,
      spinDurationMs: 4000,
      spinEasing: "easeOut",
      autoStop: true,
    }),
  },
  winnerName: {
    label: "Winner",
    description: "Latest winner's name",
    category: "Draw",
    defaultWidth: 500,
    defaultHeight: 80,
    createDefaultProps: () => ({
      fontSize: 40,
      color: "#FFCA2D",
      fontWeight: "bold",
      align: "center",
      appearEffect: "none",
      disappearEffect: "none",
      quickDrawText: "Congratulations!",
    }),
  },
  prizeImage: {
    label: "Prize",
    description: "One specific prize's image, pinned to custom artwork — click in Present Mode to select it for Draw",
    category: "Draw",
    defaultWidth: 300,
    defaultHeight: 300,
    createDefaultProps: () => ({
      fit: "cover",
      borderRadius: 12,
      prizeId: "",
      onHover: defaultPrizeStage(),
      onSelect: defaultPrizeStage("focus", "scaleUp"),
      onWon: defaultPrizeStage(),
      // Highlight = Dim 58% mặc định — giữ ĐÚNG cảm giác `outOfStockDimAmount` cũ (field nền riêng,
      // luôn bật 58% khi hết hàng, xem doc-comment PrizeInteractions trong types.ts) dù giờ "Dim" chỉ
      // còn là 1 lựa chọn Highlight bình thường như 3 giai đoạn kia — không dùng `defaultPrizeStage()`
      // vì hàm đó không cho tuỳ chỉnh `size` theo effect.
      onOutOfStock: {
        focus: noGroupEffect(),
        highlight: { ...noGroupEffect(), effect: "dim", size: 58 },
        motion: noGroupEffect(),
        appearance: "none",
      },
    }),
  },
  currentTime: {
    label: "Current Time",
    description: "Live clock",
    category: "Live",
    defaultWidth: 200,
    defaultHeight: 50,
    createDefaultProps: () => ({
      fontSize: 28,
      color: "#FFFFFF",
      align: "center",
      format: "24h",
    }),
  },
  participantCount: {
    label: "Participant Count",
    description: "Number of participants in this session",
    category: "Live",
    defaultWidth: 260,
    defaultHeight: 50,
    createDefaultProps: () => ({
      align: "center",
      label: "Participants:",
      mode: "total",
      labelFontFamily: "Inter, ui-sans-serif, sans-serif",
      labelFontSize: 20,
      labelColor: "#FFFFFF",
      countFontFamily: "Inter, ui-sans-serif, sans-serif",
      countFontSize: 24,
      countColor: "#FFCA2D",
      backgroundType: "none",
      backgroundColor: "#0B0B10",
      backgroundImageDataUrl: null,
      backgroundImageFit: "cover",
      borderRadius: 8,
    }),
  },
  button: {
    label: "Button",
    description:
      "Runs one fixed action (Draw, Confirm, Reset, Show Winner, Open Link) when clicked in Present Mode — Draw also gets a small dropdown for Multiple/Quick Draw",
    category: "Interactive",
    defaultWidth: 220,
    defaultHeight: 64,
    createDefaultProps: () => ({
      action: "none",
      urlField: "",
      multipleDrawPaceMs: 600,
      label: "Button",
      fontSize: 22,
      color: "#0B0B10",
      backgroundColor: "#FFCA2D",
      borderRadius: 12,
      strokeColor: "#0B0B10",
      strokeWidth: 0,
    }),
  },
  scoreboard: {
    label: "Scoreboard",
    description: "Table of confirmed winners — shown as a popup via a \"Show Winner\" button",
    category: "Draw",
    defaultWidth: 420,
    defaultHeight: 520,
    createDefaultProps: () => ({
      template: "table",
      title: "Winners",
      titleBarColor: "#2244A5",
      headerColor: "#FFFFFF",
      columns: ["participantName", "prizeName"],
      fontSize: 16,
      color: "#14161C",
      backgroundType: "color",
      backgroundColor: "#FFFFFF",
      backgroundImageDataUrl: null,
      backgroundImageFit: "cover",
    }),
  },
  orbitLights: {
    label: "Orbit Lights",
    description: "Glowing particles with light trails orbiting like an atom — animates in Present Mode",
    category: "Effects",
    defaultWidth: CANVAS_WIDTH,
    defaultHeight: CANVAS_HEIGHT,
    createDefaultProps: () => ({
      particleCount: 3,
      color: "#20C7F1",
      // 3 hạt 3 màu: teal + highlight vàng thương hiệu + hồng (thay "gold" xanh đậm #2244A5 — quá tối
      // để làm hạt sáng trên nền đen).
      colors: ["#20C7F1", "#FFCA2D", "#FF5C8A"],
      particleSize: 10,
      trailLength: 30,
      revolutionMs: 6000,
      orbitWidth: 35,
      showOrbits: false,
    }),
  },
};

export const COMPONENT_TYPES = Object.keys(COMPONENT_REGISTRY) as LandingComponentType[];

/** Tạo 1 component mới với vị trí `x`/`y` cho trước (toạ độ artboard, chưa scale) — dùng khi thả từ Palette. */
export function createComponentAt(type: LandingComponentType, x: number, y: number, zIndex: number): LandingComponent {
  const entry = COMPONENT_REGISTRY[type];
  const width = entry.defaultWidth;
  const height = entry.defaultHeight;
  const base = {
    id: newComponentId(),
    x: Math.round(x - width / 2),
    y: Math.round(y - height / 2),
    width,
    height,
    zIndex,
    effect: "none" as const,
  };
  return { ...base, type, props: entry.createDefaultProps() } as LandingComponent;
}
