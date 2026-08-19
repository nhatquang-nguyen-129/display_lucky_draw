import { DrawResultRow } from "@/types";
import { getParticipantExtraField, getScoreboardFieldLabel, LandingData, ScoreboardComponent, ScoreboardField } from "@/lib/landing/types";

// Chỉ tính là "đã trúng thật" khi đã CONFIRM — loại bỏ dòng "pending-<seed>" mà useDrawSequence độn
// vào đầu results cho candidate CHƯA Confirm (xem effectiveData trong useDrawSequence.ts).
function confirmedWinners(data?: LandingData) {
  return (data?.results ?? []).filter((r) => !r.id.startsWith("pending-"));
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// prizeCategory và cột optional (extra_data) không có sẵn trên DrawResultRow — phải tra chéo qua
// data.prizes/data.participants bằng participant_id/prize_id (LandingData đã có sẵn cả 2 mảng này,
// không cần thêm cột mới ở SQL/IPC layer).
function valueOf(r: DrawResultRow, field: ScoreboardField, data?: LandingData): string {
  switch (field) {
    case "participantName":
      return r.participant_name;
    case "participantCode":
      return r.participant_code ?? "—";
    case "participantPhone":
      return r.participant_phone ?? "—";
    case "participantEmail":
      return r.participant_email ?? "—";
    case "prizeName":
      return r.prize_name;
    case "prizeCategory": {
      const prize = data?.prizes.find((p) => p.id === r.prize_id);
      return prize?.category ?? "—";
    }
    default: {
      const participant = data?.participants.find((p) => p.id === r.participant_id);
      if (!participant) return "—";
      return getParticipantExtraField(participant, field) || "—";
    }
  }
}

// Config cũ (trước khi có template "table" + cột tự chọn) chỉ có showPrizeName/backgroundColor
// phẳng, thiếu hẳn columns/template/backgroundType/backgroundImageFit — đọc thẳng sẽ crash (vd
// columns.length trên undefined). Suy ra 1 bộ giá trị mặc định hợp lý, tái tạo gần đúng hiển thị cũ
// (showPrizeName=true → cũng hiện cột Prize) thay vì lỗi trắng màn hình.
function normalizeProps(props: ScoreboardComponent["props"]) {
  const legacy = props as unknown as { showPrizeName?: boolean };
  const columns: ScoreboardField[] =
    props.columns && props.columns.length > 0
      ? props.columns
      : legacy.showPrizeName
        ? ["participantName", "prizeName"]
        : ["participantName"];
  return {
    titleBarColor: props.titleBarColor ?? "#2244A5",
    columns,
    backgroundType: props.backgroundType ?? "color",
    backgroundImageFit: props.backgroundImageFit ?? "cover",
  };
}

// Template "table" (đầu tiên) — giao diện kiểu 1 cửa sổ Windows: Name Bar (title + màu nền/màu chữ
// riêng) ở trên, bên dưới là bảng người trúng với cột tự chọn + nền riêng (màu hoặc ảnh). Bảng dựng
// bằng CSS Grid (không phải <table>) — header cột đứng yên (position: sticky) khi cuộn danh sách dài,
// mỗi ô header/giá trị là 1 grid item, tự chia đều theo số cột đang bật.
export default function TableTemplate({
  component,
  data,
  onClose,
}: {
  component: ScoreboardComponent;
  data?: LandingData;
  onClose?: () => void;
}) {
  const { title, headerColor, fontSize, color, backgroundColor, backgroundImageDataUrl } = component.props;
  const { titleBarColor, columns: cols, backgroundType, backgroundImageFit } = normalizeProps(component.props);
  const winners = confirmedWinners(data);
  // Nền của hàng tiêu đề cột PHẢI đục màu (không trong suốt) để không bị chữ/hàng bên dưới đè lên khi
  // cuộn — dùng đúng màu nền khung nếu là "color", còn "image"/"none" thì fallback về 1 lớp trắng gần
  // đục để tiêu đề luôn đọc được bất kể ảnh nền bên dưới là gì.
  const headerBg = backgroundType === "color" ? backgroundColor : "rgba(255,255,255,0.92)";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg shadow-2xl" style={{ pointerEvents: "auto" }}>
      {/* Name Bar — kiểu thanh tiêu đề cửa sổ Windows */}
      <div
        className="flex shrink-0 items-center justify-between px-3 py-2"
        style={{ backgroundColor: titleBarColor }}
      >
        <span className="truncate font-bold" style={{ color: headerColor, fontSize: fontSize * 1.1 }}>
          {title}
        </span>
        <button
          type="button"
          onClick={() => onClose?.()}
          title="Close"
          className="rounded p-1 hover:bg-white/20"
          style={{ color: headerColor }}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Khung bảng — nền riêng, độc lập với Name Bar */}
      <div
        className="min-h-0 flex-1 overflow-auto"
        style={{
          backgroundColor: backgroundType === "color" ? backgroundColor : undefined,
          backgroundImage:
            backgroundType === "image" && backgroundImageDataUrl ? `url(${backgroundImageDataUrl})` : undefined,
          backgroundSize:
            backgroundImageFit === "contain" ? "contain" : backgroundImageFit === "stretch" ? "100% 100%" : "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {winners.length === 0 ? (
          <p className="p-3" style={{ color, fontSize, opacity: 0.6 }}>
            No winners yet
          </p>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
            {cols.map((f) => (
              <div
                key={`head-${f}`}
                className="sticky top-0 z-10 truncate px-2 py-1.5 text-left font-semibold uppercase tracking-wide"
                style={{ color, backgroundColor: headerBg, fontSize }}
              >
                {getScoreboardFieldLabel(f)}
              </div>
            ))}
            {winners.map((r, i) =>
              cols.map((f) => (
                <div
                  key={`${r.id}-${f}`}
                  className="truncate px-2 py-1.5"
                  style={{ color, fontSize, backgroundColor: i % 2 === 1 ? "rgba(0,0,0,0.045)" : undefined }}
                >
                  {valueOf(r, f, data)}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
