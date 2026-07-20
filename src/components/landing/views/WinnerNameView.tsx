import { LandingData, WinnerNameComponent } from "@/lib/landing/types";

export default function WinnerNameView({ component, data }: { component: WinnerNameComponent; data?: LandingData }) {
  const { fontSize, color, fontWeight, align, fallbackText } = component.props;
  const latest = data?.results[0];
  return (
    <div
      className="flex h-full w-full items-center overflow-hidden whitespace-pre-wrap break-words"
      style={{
        fontSize,
        color,
        fontWeight,
        textAlign: align,
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      }}
    >
      {latest ? latest.participant_name : fallbackText}
    </div>
  );
}
