import { getParticipantField, isLiveDrawResultId, LandingData, WinnerNameComponent } from "@/lib/landing/types";
import { APPEAR_CLASS, useRevealed, useRevealTransition } from "./drawRevealHooks";

// CHỈ trong canvas kéo-thả của Landing Builder (xem `builderPreview` — bắt nguồn từ `clip={false}`,
// tín hiệu riêng LandingCanvas.tsx đã dùng sẵn để tự nhận diện, xem LandingRenderer.tsx) — hiện chữ
// này thay vì để trống như lúc Idle thật (nhìn qua rất khó biết đây là khung Winner để chọn/sửa).
// LandingPage.tsx (preview read-only ở cửa sổ chính) và Present Mode thật PHẢI giữ nguyên trạng thái
// ẩn/hiện thật theo kết quả Draw — 2 nơi đó không truyền `builderPreview`, dù bản thân chúng cũng
// không "interactive" giống LandingPage.tsx, nên KHÔNG được gộp chung với cờ đó.
const BUILDER_PLACEHOLDER = "Winner";

export default function WinnerNameView({
  component,
  data,
  builderPreview,
  quickDrawActive,
  resetSeq,
}: {
  component: WinnerNameComponent;
  data?: LandingData;
  builderPreview?: boolean;
  // Vừa chạy xong 1 Quick Draw (xem DrawSequenceActions.quickDrawResult trong types.ts) — hiện
  // component.props.quickDrawText THAY VÌ tên người trúng, vì Quick Draw ra NHIỀU người cùng lúc,
  // không có 1 tên "đúng" nào để hiện. Ưu tiên CAO HƠN cả tên thật lẫn trạng thái Idle (chỉ
  // builderPreview mới ghi đè được nó, xem `text` bên dưới).
  quickDrawActive?: boolean;
  // DrawSequenceActions.resetSeq — xem doc-comment ở types.ts và useRevealed trong drawRevealHooks.ts.
  resetSeq?: number;
}) {
  const {
    fontSize,
    color,
    fontWeight,
    align,
    appearEffect,
    disappearEffect,
    appearDelayMs,
    disappearDelayMs,
    idleState,
    idleEffect,
    idleDelayMs,
    quickDrawText,
    nameSourceColumn,
  } = component.props;
  const latest = data?.results[0];
  // CHỈ coi là "có winner để hiện" khi results[0] là dòng LIVE (id "pending-*" — 1 lượt Draw đang diễn
  // ra trong phiên Present này). Kết quả cũ đọc từ DB khi mở lại 1 phiên đã quay dở KHÔNG kích hoạt
  // reveal — nếu không tên winner cũ sẽ tự nhảy lên ngay dù chưa ai bấm Draw.
  const liveResultId = isLiveDrawResultId(latest?.id) ? latest!.id : undefined;
  // `nameSourceColumn` (đặt qua Properties Panel — xem WinnerNameProps trong types.ts) ghi đè cột Name
  // "chính thức" (`latest.participant_name`, đã resolve sẵn ở server) — chỉ cần khi session có NHIỀU
  // HƠN 1 cột Data Type = Name và muốn khung Winner Name này hiện đúng cột cụ thể đó. Không tìm thấy
  // participant/cột/giá trị rỗng thì fallback về `participant_name` như hành vi mặc định cũ.
  const winnerName = (() => {
    if (!latest) return "";
    if (nameSourceColumn) {
      const participant = data?.participants.find((p) => p.id === latest.participant_id);
      const value = participant ? getParticipantField(participant, nameSourceColumn) : "";
      if (value) return value;
    }
    return latest.participant_name;
  })();
  // 3 trạng thái Idle/Revealed/Disappear (xem doc-comment WinnerNameProps trong types.ts và
  // useRevealed trong drawRevealHooks.ts) — hoàn toàn tự quản lý qua appearDelayMs/disappearDelayMs
  // của CHÍNH Winner Name này, không còn phụ thuộc thời lượng quay của Lucky Wheel trên trang.
  const revealedName = useRevealed(
    liveResultId,
    winnerName,
    appearDelayMs ?? 0,
    disappearDelayMs ?? 0,
    resetSeq,
    idleState ?? "disappear"
  );
  const text = builderPreview ? BUILDER_PLACEHOLDER : quickDrawActive ? quickDrawText : revealedName;

  const { current, previous, previousClass } = useRevealTransition(
    text,
    appearEffect ?? "none",
    disappearEffect ?? "none",
    resetSeq,
    idleEffect,
    idleDelayMs
  );

  const justifyContent = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const transitioning = previous !== null;
  // `key = current` — buộc React remount lớp "current" mỗi khi NỘI DUNG đổi (kể cả 2 lượt transition
  // liên tiếp trước khi lượt trước kịp về "đứng yên", xem useRevealTransition) — nếu không, class
  // "-in" có thể GIỮ NGUYÊN giá trị chuỗi qua 2 lượt (chỉ nội dung bên trong đổi), CSS animation sẽ
  // không tự phát lại vì với browser đó vẫn là "chưa đổi class". Đứng yên với nội dung không đổi thì
  // KHÔNG remount (key trùng), tránh giật hình vô cớ.
  const layerKey = current;

  return (
    <div
      className="relative flex h-full w-full items-center overflow-hidden whitespace-pre-wrap break-words"
      style={{ fontSize, color, fontWeight, textAlign: align, justifyContent }}
    >
      {transitioning && (
        <span className={`absolute inset-0 flex items-center ${previousClass}`} style={{ justifyContent }}>
          {previous}
        </span>
      )}
      <span
        key={layerKey}
        className={
          transitioning
            ? `absolute inset-0 flex items-center ${APPEAR_CLASS[appearEffect ?? "none"]}`
            : "inline-block"
        }
        style={transitioning ? { justifyContent } : undefined}
      >
        {current}
      </span>
    </div>
  );
}
