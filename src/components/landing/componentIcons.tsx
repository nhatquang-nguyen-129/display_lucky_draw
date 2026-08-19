import { LandingComponentType } from "@/lib/landing/types";

// Icon riêng cho từng loại component — dùng bởi ComponentPalette.tsx (menu "Add component"). Cùng
// quy ước "viewBox 0 0 24 24, stroke currentColor" đã dùng cho icon toolbar trong
// LandingBuilderWindow.tsx.

function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 3.5 3.5L17 10l3 3" />
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

function WinnerNameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M12 13v3M9 20h6M10 16h4v4h-4v-4Z" />
    </svg>
  );
}

function PrizeNameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="9" width="18" height="11" rx="1.5" />
      <path d="M3 9h18v4H3z" />
      <path d="M12 9v11" />
      <path d="M12 9c-1-3-3.5-5-5.5-4S6 8 9 9M12 9c1-3 3.5-5 5.5-4S18 8 15 9" />
    </svg>
  );
}

function PrizeImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="m3 17 4.5-4.5L11 16l4-4 6 5" />
      <path d="M9 3v3M12 3v3" />
    </svg>
  );
}

function CurrentTimeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function ParticipantCountIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.5c1.5.4 2.5 1.8 2.5 3.3s-1 2.9-2.5 3.3" />
      <path d="M18 14c2.3.5 4 2.6 4 6" />
    </svg>
  );
}

function ButtonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="8" width="18" height="9" rx="3" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  );
}

function ScoreboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
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
  text: TextIcon,
  image: ImageIcon,
  luckyWheel: LuckyWheelIcon,
  winnerName: WinnerNameIcon,
  prizeName: PrizeNameIcon,
  prizeImage: PrizeImageIcon,
  currentTime: CurrentTimeIcon,
  participantCount: ParticipantCountIcon,
  button: ButtonIcon,
  scoreboard: ScoreboardIcon,
};

export default function ComponentTypeIcon({ type }: { type: LandingComponentType }) {
  const Icon = ICONS[type] ?? GenericComponentIcon;
  return <Icon />;
}
