// Nơi DUY NHẤT "nối dây" 1 loại component vào Palette (kéo-thả) + Canvas (tạo instance mặc định
// khi thả). Thêm loại mới chỉ cần thêm 1 entry ở đây (sau khi đã có type ở lib/landing/types.ts
// và view/panel tương ứng) — xem checklist ở đầu lib/landing/types.ts.

import { LandingComponent, LandingComponentType, newComponentId } from "@/lib/landing/types";

export interface ComponentRegistryEntry {
  label: string;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
  createDefaultProps: () => LandingComponent["props"];
}

export const COMPONENT_REGISTRY: Record<LandingComponentType, ComponentRegistryEntry> = {
  text: {
    label: "Text",
    description: "Static label or heading",
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
    }),
  },
  scoreboard: {
    label: "Scoreboard",
    description: "Table of confirmed winners — shown as a popup via a \"Show Winner\" button",
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
    defaultWidth: 1920,
    defaultHeight: 1080,
    createDefaultProps: () => ({
      preset: "burstCenter",
      particleCount: 130,
      colorPalette: "brand",
      duration: 3000,
      launchDirection: 0,
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
// và phản ứng (làm đích/target trên Graph, chỉ Signal RECEIVER mới có) — 1 loại component chỉ nên
// có ĐÚNG 1 trong 2 field này, không bao giờ cả hai (xem nguyên tắc Emitter/Receiver ở CLAUDE.md).
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
  button: { emits: ["Button.Click"] },
  luckyWheel: { listensFor: ["Wheel.StartSpin"] },
  fireworks: { listensFor: ["Fireworks.Play", "Fireworks.Stop"] },
  stageLight: { listensFor: ["StageLight.Play", "StageLight.Stop"] },
};
