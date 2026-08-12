// Nơi DUY NHẤT "nối dây" 1 loại component vào Palette (kéo-thả) + Canvas (tạo instance mặc định
// khi thả). Thêm loại mới chỉ cần thêm 1 entry ở đây (sau khi đã có type ở lib/landing/types.ts
// và view/panel tương ứng) — xem checklist ở đầu lib/landing/types.ts.

import { LandingComponent, LandingComponentType, newComponentId } from "@/lib/landing/types";

// Nhóm hiển thị trong ComponentPalette.tsx (menu "Add component") — CHỈ ảnh hưởng thứ tự/cách gom
// nhóm khi kéo-thả, không liên quan gì tới Emitter/Receiver (1 nhóm có thể trộn cả 2, vd "Effects"
// gồm toàn Receiver còn "Interactive" chỉ có Emitter — nhóm theo công dụng người dùng nhìn thấy,
// không theo kiến trúc tín hiệu bên trong). Thứ tự mảng này = thứ tự nhóm hiện trên Palette.
export const CATEGORY_ORDER = ["Basic", "Draw & Results", "Live Info", "Interactive", "Effects", "Actions"] as const;
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
  luckyWheel: {
    label: "Lucky Wheel",
    description: "Spinning wheel bound to the Draw Engine",
    category: "Draw & Results",
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
      reelCardEffect: "pop",
      reelNumberEffect: "bounce",
      revealTiming: "together",
      revealStaggerMs: 150,
      landingEffect: "none",
      fontFamily: "Inter, ui-sans-serif, sans-serif",
      fontColor: "#FFFFFF",
      fontSize: 20,
      spinDurationMs: 4000,
      spinEasing: "easeOut",
      autoStop: true,
    }),
  },
  winnerName: {
    label: "Winner Name",
    description: "Latest winner's name",
    category: "Draw & Results",
    defaultWidth: 500,
    defaultHeight: 80,
    createDefaultProps: () => ({
      fontSize: 40,
      color: "#FFCA2D",
      fontWeight: "bold",
      align: "center",
      fallbackText: "—",
    }),
  },
  prizeName: {
    label: "Prize Name",
    description: "Latest won prize's name",
    category: "Draw & Results",
    defaultWidth: 500,
    defaultHeight: 60,
    createDefaultProps: () => ({
      fontSize: 28,
      color: "#FFFFFF",
      fontWeight: "normal",
      align: "center",
      fallbackText: "—",
    }),
  },
  prizeImage: {
    label: "Prize Image",
    description: "Latest won prize's image",
    category: "Draw & Results",
    defaultWidth: 300,
    defaultHeight: 300,
    createDefaultProps: () => ({
      fit: "cover",
      borderRadius: 12,
      fallbackImageDataUrl: null,
    }),
  },
  prizeList: {
    label: "Prize List",
    description: "List of all prizes in this session",
    category: "Draw & Results",
    defaultWidth: 360,
    defaultHeight: 300,
    createDefaultProps: () => ({
      fontSize: 18,
      color: "#FFFFFF",
      showRemaining: true,
    }),
  },
  countdown: {
    label: "Countdown",
    description: "Counts down to a target date/time",
    category: "Live Info",
    defaultWidth: 300,
    defaultHeight: 60,
    createDefaultProps: () => ({
      targetIsoTime: null,
      fontSize: 32,
      color: "#FFFFFF",
      align: "center",
      completedText: "Time's up!",
    }),
  },
  currentTime: {
    label: "Current Time",
    description: "Live clock",
    category: "Live Info",
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
    category: "Live Info",
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
    description: "Signal Emitter — emits Button.Click, active in Present Mode only",
    category: "Interactive",
    defaultWidth: 220,
    defaultHeight: 64,
    createDefaultProps: () => ({
      label: "Button",
      fontSize: 22,
      color: "#0B0B10",
      backgroundColor: "#FFCA2D",
      borderRadius: 12,
      strokeColor: "#0B0B10",
      strokeWidth: 0,
      startEnabled: true,
    }),
  },
  scoreboard: {
    label: "Scoreboard",
    description: "Table of confirmed winners — shown as a popup via a \"Show Winner\" button",
    category: "Draw & Results",
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
  fireworks: {
    label: "Fireworks",
    description: "Particle burst effect — wire a Trigger Graph link to Play/Stop it",
    category: "Effects",
    defaultWidth: 1920,
    defaultHeight: 1080,
    createDefaultProps: () => ({
      preset: "burstCenter",
      particleCount: 130,
      colorPalette: "brand",
      duration: 3000,
      launchDirection: 0,
      launchHeight: 0.55,
      spreadAngle: 360,
      burstRadius: 40,
      gravity: 650,
      speed: 380,
      loop: false,
    }),
  },
  stageLight: {
    label: "Stage Light",
    description: "Sweeping spotlight beam — wire a Trigger Graph link to Play/Stop it",
    category: "Effects",
    defaultWidth: 300,
    defaultHeight: 500,
    createDefaultProps: () => ({
      beamColor: "#FFCA2D",
      beamOpacity: 0.5,
      beamWidth: 220,
      beamLength: 480,
      sweepAngle: 0,
      swingRange: 35,
      sweepSpeed: 2.5,
      blurAmount: 12,
      intensity: 0.8,
      duration: 4000,
      loop: true,
    }),
  },
  dimBackground: {
    label: "Dim Background",
    description: "Fades a color overlay in/out — wire a Trigger Graph link to Play/Stop it",
    category: "Effects",
    defaultWidth: 1920,
    defaultHeight: 1080,
    createDefaultProps: () => ({
      color: "#000000",
      targetOpacity: 0.6,
      fadeDurationMs: 500,
    }),
  },
  linkOpener: {
    label: "Link Opener",
    description: "Opens the latest winner's URL in a browser — wire a Trigger Graph link to it",
    category: "Actions",
    defaultWidth: 160,
    defaultHeight: 64,
    createDefaultProps: () => ({
      urlField: "",
    }),
  },
  draw: {
    label: "Draw",
    description: "Picks a pending winner for the current draw — wire a Trigger Graph link to it",
    category: "Actions",
    defaultWidth: 160,
    defaultHeight: 64,
    createDefaultProps: () => ({}),
  },
  confirmWinner: {
    label: "Confirm Winner",
    description: "Commits the pending draw result to the database — wire a Trigger Graph link to it",
    category: "Actions",
    defaultWidth: 160,
    defaultHeight: 64,
    createDefaultProps: () => ({}),
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

// Từ vựng tín hiệu Trigger Graph của TỪNG loại component — "emits" là Event loại này CÓ THỂ phát ra
// (làm nguồn/source trên Graph, chỉ Signal EMITTER mới có), "listensFor" là Command loại này HIỂU
// và phản ứng (làm đích/target trên Graph, chỉ Signal RECEIVER mới có).
// Đa số component chỉ có ĐÚNG 1 trong 2 field này (xem nguyên tắc Emitter/Receiver ở CLAUDE.md).
// NGOẠI LỆ HẸP: 1 Receiver có animation hoàn thành sau 1 khoảng thời gian KHÔNG CỐ ĐỊNH (vd Lucky
// Wheel — tuỳ template/reveal timing mà lúc quay xong khác nhau mỗi lần) được phép có thêm ĐÚNG 1
// emit cho tín hiệu "báo xong việc nó vừa được giao" (vd "Wheel.SpinCompleted") — để nối chuỗi hành
// động (Wheel quay xong → Fireworks bắn) mà không phải đoán 1 khoảng delay cố định rồi hy vọng khớp
// (không chính xác, dễ lệch mỗi khi đổi cấu hình animation). Đây KHÔNG phải "component tự do vừa
// Emitter vừa Receiver" — chỉ áp dụng cho đúng 1 tín hiệu hoàn-thành-việc-của-chính-nó, không phải
// danh sách emit tuỳ ý không liên quan gì tới Command nó vừa nhận.
// Loại nào KHÔNG có mặt ở đây (Text/Image/Countdown/PrizeList/...) không bao giờ tham gia Trigger
// Graph — bị lọc bỏ hoàn toàn khỏi màn hình đó (xem TriggerGraphEditor.tsx), tránh rối mắt với
// những component không liên quan gì tới việc điều khiển bằng tín hiệu.
// Đây là nguồn dữ liệu DUY NHẤT cho các dropdown Source/Signal trên Trigger Graph — không có tên tín
// hiệu tự gõ tuỳ ý, tránh gõ lệch tên giữa nguồn phát và đích nhận khiến liên kết không bao giờ khớp.
// Tên tín hiệu luôn theo quy ước "Component.Action" (vd "Wheel.StartSpin") — tự thân đã đủ rõ nghĩa
// nên không cần thêm 1 field label riêng (khác bản đầu tiên của hệ thống này).
export interface ComponentSignals {
  emits?: string[];
  listensFor?: string[];
}

export const COMPONENT_SIGNALS: Partial<Record<LandingComponentType, ComponentSignals>> = {
  // "Gateable Emitter" — ngoại lệ hẹp thứ 2 (xem checklist đầu types.ts): Button vẫn CHỈ emit
  // Button.Click, nhưng listensFor thêm đúng 2 Command chung để 1 Signal bất kỳ trên Graph khoá/mở
  // được nó (vd "Wheel.SpinCompleted → Confirm.Enable") — xem ButtonView.tsx.
  button: { emits: ["Button.Click"], listensFor: ["Button.Enable", "Button.Disable"] },
  // Lucky Wheel vừa listensFor (nhận lệnh quay) vừa emits (tự báo khi quay xong) — xem ngoại lệ hẹp
  // ở comment trên. "Wheel.SpinCompleted" bắn qua sequence.fireClick() ngay tại điểm animation quay
  // THẬT SỰ kết thúc (xem WheelTemplate.tsx/DigitRollerTemplate.tsx), không phải 1 delay đoán trước.
  luckyWheel: { listensFor: ["Wheel.StartSpin"], emits: ["Wheel.SpinCompleted"] },
  fireworks: { listensFor: ["Fireworks.Play", "Fireworks.Stop"] },
  stageLight: { listensFor: ["StageLight.Play", "StageLight.Stop"] },
  dimBackground: { listensFor: ["DimBackground.Play", "DimBackground.Stop"] },
  // Mở URL là 1 side effect tức thời (không phải animation có trạng thái đang chạy) — chỉ cần 1
  // Command duy nhất, không có ".Stop" như Fireworks/Stage Light.
  linkOpener: { listensFor: ["LinkOpener.Open"] },
  // Ngoại lệ hẹp — giống Lucky Wheel (xem comment ở DrawComponent trong types.ts): pick() là IPC bất
  // đồng bộ, "Draw.Picked" chỉ bắn SAU KHI pick() thật sự thành công (xem DrawView.tsx), để nối
  // chuỗi chính xác sang Wheel.StartSpin thay vì đoán 1 delay cố định.
  draw: { listensFor: ["Draw.Pick"], emits: ["Draw.Picked"] },
  confirmWinner: { listensFor: ["ConfirmWinner.Confirm"] },
};
