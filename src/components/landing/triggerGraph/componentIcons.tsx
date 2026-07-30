import { LandingComponentType } from "@/lib/landing/types";

// Icon riêng cho từng loại component xuất hiện trên Trigger Graph — CHỈ cần các loại có mặt trong
// COMPONENT_SIGNALS (componentRegistry.ts), vì chỉ những loại đó mới bao giờ hiện ra làm node ở đây.
// Cùng quy ước "viewBox 0 0 24 24, stroke currentColor" đã dùng cho icon toolbar trong
// LandingBuilderWindow.tsx.

function ButtonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="8" width="18" height="9" rx="3" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  );
}

function LuckyWheelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6.5 3.7" />
      <path d="M12 12 5.5 15.7" />
    </svg>
  );
}

function FireworksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}

function StageLightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M9 3h6l1.5 6h-9L9 3Z" />
      <path d="M7.5 9 4 20h16L16.5 9" />
    </svg>
  );
}

function GenericComponentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="h-5 w-5">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

const ICONS: Partial<Record<LandingComponentType, () => JSX.Element>> = {
  button: ButtonIcon,
  luckyWheel: LuckyWheelIcon,
  fireworks: FireworksIcon,
  stageLight: StageLightIcon,
};

export default function ComponentTypeIcon({ type }: { type: LandingComponentType }) {
  const Icon = ICONS[type] ?? GenericComponentIcon;
  return <Icon />;
}
