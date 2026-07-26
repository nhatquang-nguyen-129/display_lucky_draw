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
      fontSize: 24,
      color: "#FFFFFF",
      align: "center",
      label: "Participants:",
      mode: "total",
    }),
  },
  button: {
    label: "Button",
    description: "Draw / Confirm / Redo trigger — active in Present Mode only",
    defaultWidth: 220,
    defaultHeight: 64,
    createDefaultProps: () => ({
      action: "draw",
      label: "Draw",
      fontSize: 22,
      color: "#0B0B10",
      backgroundColor: "#FFCA2D",
      borderRadius: 12,
      strokeColor: "#0B0B10",
      strokeWidth: 0,
      urlField: undefined,
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
