import { LandingData, ParticipantCountComponent } from "@/lib/landing/types";

// Config cũ (trước khi tách Label/Count) chỉ có fontSize/color dùng chung — field đó KHÔNG còn
// trong ParticipantCountProps nữa nhưng vẫn có thể còn tồn tại trong JSON đã lưu, đọc lại qua `any`
// làm fallback để landing cũ hiển thị giữ nguyên (xem comment ở types.ts).
function legacyStyle(props: ParticipantCountComponent["props"]) {
  return props as unknown as { fontSize?: number; color?: string };
}

export default function ParticipantCountView({
  component,
  data,
}: {
  component: ParticipantCountComponent;
  data?: LandingData;
}) {
  const props = component.props;
  const legacy = legacyStyle(props);
  const { label, mode, align, backgroundType, backgroundImageFit } = props;

  const labelFontFamily = props.labelFontFamily ?? "Inter, ui-sans-serif, sans-serif";
  const labelFontSize = props.labelFontSize ?? legacy.fontSize ?? 24;
  const labelColor = props.labelColor ?? legacy.color ?? "#FFFFFF";
  const countFontFamily = props.countFontFamily ?? "Inter, ui-sans-serif, sans-serif";
  const countFontSize = props.countFontSize ?? legacy.fontSize ?? 24;
  const countColor = props.countColor ?? legacy.color ?? "#FFFFFF";

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
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        // Chỉ thêm đệm khi thật sự có nền hiện ra — tránh dịch chuyển vị trí chữ so với landing đã
        // lưu trước đây (backgroundType mặc định "none" cho config cũ không có field này).
        padding: backgroundType === "none" ? 0 : "0 12px",
        backgroundColor: backgroundType === "color" ? props.backgroundColor : undefined,
        backgroundImage:
          backgroundType === "image" && props.backgroundImageDataUrl ? `url(${props.backgroundImageDataUrl})` : undefined,
        backgroundSize:
          backgroundImageFit === "contain" ? "contain" : backgroundImageFit === "stretch" ? "100% 100%" : "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        borderRadius: backgroundType === "none" ? undefined : props.borderRadius,
      }}
    >
      {label && <span style={{ fontFamily: labelFontFamily, fontSize: labelFontSize, color: labelColor }}>{label}</span>}
      <span
        className="font-mono font-semibold"
        style={{ fontFamily: countFontFamily, fontSize: countFontSize, color: countColor }}
      >
        {count}
      </span>
    </div>
  );
}
