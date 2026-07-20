import { LandingData, ParticipantCountComponent } from "@/lib/landing/types";

export default function ParticipantCountView({
  component,
  data,
}: {
  component: ParticipantCountComponent;
  data?: LandingData;
}) {
  const { fontSize, color, align, label, mode } = component.props;
  const participants = data?.participants ?? [];
  const results = data?.results ?? [];

  const count =
    mode === "remainingEligible"
      ? participants.filter((p) => !results.some((r) => r.participant_id === p.id)).length
      : participants.length;

  return (
    <div
      className="flex h-full w-full items-center gap-2 overflow-hidden"
      style={{
        fontSize,
        color,
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      }}
    >
      {label && <span>{label}</span>}
      <span className="font-mono font-semibold">{count}</span>
    </div>
  );
}
