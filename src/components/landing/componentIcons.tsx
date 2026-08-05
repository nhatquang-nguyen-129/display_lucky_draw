import { LandingComponentType } from "@/lib/landing/types";

// Icon riêng cho từng loại component — dùng chung bởi ComponentPalette.tsx (menu "Add component")
// VÀ triggerGraph/ComponentNode.tsx (chỉ những loại có mặt trong COMPONENT_SIGNALS mới bao giờ hiện
// ra làm node ở Trigger Graph, nhưng Palette cần icon cho TẤT CẢ loại). Cùng quy ước "viewBox 0 0 24
// 24, stroke currentColor" đã dùng cho icon toolbar trong LandingBuilderWindow.tsx.

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

function PrizeListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function CountdownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 5 5 6.5 5 9s-5 4-5 9M17 3c0 5-5 6.5-5 9s5 4 5 9" />
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

function LinkOpenerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M10 14 20 4M20 4h-5M20 4v5" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </svg>
  );
}

function DrawIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" />
    </svg>
  );
}

function ConfirmWinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
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
  prizeList: PrizeListIcon,
  countdown: CountdownIcon,
  currentTime: CurrentTimeIcon,
  participantCount: ParticipantCountIcon,
  button: ButtonIcon,
  scoreboard: ScoreboardIcon,
  fireworks: FireworksIcon,
  stageLight: StageLightIcon,
  linkOpener: LinkOpenerIcon,
  draw: DrawIcon,
  confirmWinner: ConfirmWinnerIcon,
};

export default function ComponentTypeIcon({ type }: { type: LandingComponentType }) {
  const Icon = ICONS[type] ?? GenericComponentIcon;
  return <Icon />;
}
