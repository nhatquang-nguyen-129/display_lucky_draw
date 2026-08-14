// Nơi DUY NHẤT "nối dây" 1 loại component vào Palette (kéo-thả) + Canvas (tạo instance mặc định
// khi thả). Thêm loại mới chỉ cần thêm 1 entry ở đây (sau khi đã có type ở lib/landing/types.ts
// và view/panel tương ứng) — xem checklist ở đầu lib/landing/types.ts.

import { LandingComponent, LandingComponentType, newComponentId } from "@/lib/landing/types";

// Nhóm hiển thị trong ComponentPalette.tsx (menu "Add component") — CHỈ ảnh hưởng thứ tự/cách gom
// nhóm khi kéo-thả. Thứ tự mảng này = thứ tự nhóm hiện trên Palette.
export const CATEGORY_ORDER = ["Basic", "Draw & Results", "Live Info", "Interactive"] as const;
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
      revealEffect: "none",
      transitionEffect: "none",
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
    description: "A prize's image — latest winner's, or one specific prize pinned to custom artwork",
    category: "Draw & Results",
    defaultWidth: 300,
    defaultHeight: 300,
    createDefaultProps: () => ({
      fit: "cover",
      borderRadius: 12,
      fallbackImageDataUrl: null,
      source: "latestWinner",
      prizeId: "",
      selectable: false,
      glowColor: "#FFCA2D",
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
  prizeGallery: {
    label: "Prize Gallery",
    description: "Grid of every prize's image — hover to preview, click to lock in which prize Draw targets",
    category: "Draw & Results",
    defaultWidth: 600,
    defaultHeight: 400,
    createDefaultProps: () => ({
      columns: 3,
      gap: 12,
      imageFit: "cover",
      borderRadius: 8,
      showName: true,
      nameFontSize: 14,
      nameColor: "#FFFFFF",
      glowColor: "#FFCA2D",
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
    description: "Runs one fixed action (Draw, Confirm, Reset, Show Winner, Open Link) when clicked in Present Mode",
    category: "Interactive",
    defaultWidth: 220,
    defaultHeight: 64,
    createDefaultProps: () => ({
      action: "none",
      urlField: "",
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
