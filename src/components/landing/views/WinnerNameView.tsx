import { isLiveDrawResultId, LandingData, WinnerNameComponent } from "@/lib/landing/types";
import { APPEAR_CLASS, DISAPPEAR_CLASS, useRevealed, useRevealTransition } from "./drawRevealHooks";

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
  revealDelayMs = 0,
  quickDrawActive,
}: {
  component: WinnerNameComponent;
  data?: LandingData;
  builderPreview?: boolean;
  // Chờ đúng bằng thời lượng Lucky Wheel trên trang quay xong hẳn (xem computeWheelRevealDelayMs
  // trong types.ts) rồi mới hiện tên thật — 0 nếu trang không có Wheel nào (hiện ngay).
  revealDelayMs?: number;
  // Vừa chạy xong 1 Quick Draw (xem DrawSequenceActions.quickDrawResult trong types.ts) — hiện
  // component.props.quickDrawText THAY VÌ tên người trúng, vì Quick Draw ra NHIỀU người cùng lúc,
  // không có 1 tên "đúng" nào để hiện. Ưu tiên CAO HƠN cả tên thật lẫn trạng thái Idle (chỉ
  // builderPreview mới ghi đè được nó, xem `text` bên dưới).
  quickDrawActive?: boolean;
}) {
  const { fontSize, color, fontWeight, align, appearEffect, disappearEffect, quickDrawText } = component.props;
  const latest = data?.results[0];
  // CHỈ coi là "có winner để hiện" khi results[0] là dòng LIVE (id "pending-*" — 1 lượt Draw đang diễn
  // ra trong phiên Present này). Kết quả cũ đọc từ DB khi mở lại 1 phiên đã quay dở KHÔNG kích hoạt
  // reveal — nếu không tên winner cũ sẽ tự nhảy lên sau revealDelayMs dù chưa ai bấm Draw.
  const liveResultId = isLiveDrawResultId(latest?.id) ? latest!.id : undefined;

  const revealed = useRevealed(liveResultId, revealDelayMs);
  const isRevealed = !builderPreview && revealed;
  const text = builderPreview ? BUILDER_PLACEHOLDER : quickDrawActive ? quickDrawText : isRevealed ? latest!.participant_name : "";

  const { current, previous } = useRevealTransition(text, appearEffect ?? "none", disappearEffect ?? "none");

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
        <span
          className={`absolute inset-0 flex items-center ${DISAPPEAR_CLASS[disappearEffect ?? "none"]}`}
          style={{ justifyContent }}
        >
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
