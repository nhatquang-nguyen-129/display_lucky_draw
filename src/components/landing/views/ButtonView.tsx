import { useEffect, useRef, useState } from "react";
import { ButtonAction, ButtonComponent, DrawMode, DrawSequenceActions, getParticipantField, LandingData } from "@/lib/landing/types";

// 2 action ghi dữ liệu THẬT, VĨNH VIỄN (xem docs/landing-builder.md mục 6) — bắt buộc xác nhận qua
// popup (sequence.requestConfirm(), vẽ ở LandingRenderer.tsx) trước khi thật sự chạy, tránh bấm
// nhầm giữa lúc trình chiếu trực tiếp. Action còn lại không cần — hoặc vô hại (draw/
// toggleScoreboard/openLink không ghi gì bất thuận nghịch), hoặc đã tự no-op an toàn sẵn.
const CONFIRM_MESSAGES: Partial<Record<ButtonAction, string>> = {
  confirm: "Are you sure you want to confirm this winner? This will be saved permanently.",
  reset: "Are you sure you want to reset the session? All draw results will be permanently deleted.",
};

// Bấm là chạy đúng 1 action cố định đã chọn trong Properties Panel — gọi thẳng hàm tương ứng của
// DrawSequenceActions, không qua tín hiệu/trung gian nào (trừ "confirm"/"reset" phải qua popup xác
// nhận trước, xem CONFIRM_MESSAGES + handleClick bên dưới). "openLink" đọc URL từ field đã chọn
// của winner GẦN NHẤT (data.results[0]) — no-op im lặng nếu chưa có winner hoặc field rỗng, giữ
// đúng triết lý "bấm nhầm lúc chưa có gì thì không xảy ra chuyện gì", không báo lỗi phiền người vận hành.
function runAction(component: ButtonComponent, sequence: DrawSequenceActions, data: LandingData | undefined) {
  const { action, urlField, multipleDrawPaceMs } = component.props;
  switch (action) {
    case "draw":
      // Nút Draw CHÍNH là nút DUY NHẤT thật sự tiến hành quay — chạy ĐÚNG chế độ đang ARM
      // (sequence.drawMode: single/multiple/quick, chọn qua dropdown mũi tên cạnh nút, xem DrawMenu
      // bên dưới). Toàn bộ logic rẽ nhánh (single = pick/redo cũ; multiple/quick = chạy batch với
      // drawCount đã lưu) nằm trong sequence.runDraw() — xem useDrawSequence.ts. `multipleDrawPaceMs`
      // đọc THẲNG từ Properties Panel ngay lúc bấm (không phải lúc arm mode), nên đổi số ở panel có
      // hiệu lực ngay từ lượt Multiple Draw kế tiếp, không cần chọn lại mode.
      sequence.runDraw(multipleDrawPaceMs);
      return;
    case "confirm":
      sequence.confirm();
      return;
    case "reset":
      sequence.resetSession();
      return;
    case "toggleScoreboard":
      sequence.toggleScoreboard();
      return;
    case "openLink": {
      const winnerRow = data?.results?.[0];
      const participant = winnerRow ? data?.participants.find((p) => p.id === winnerRow.participant_id) : undefined;
      const url = participant ? getParticipantField(participant, urlField ?? "") : "";
      if (!url) return;
      window.api.shell.openExternal(url);
      return;
    }
    case "none":
    default:
      return;
  }
}

const DRAW_MODES: DrawMode[] = ["single", "multiple", "quick"];
const DRAW_MODE_LABELS: Record<DrawMode, string> = {
  single: "Single Draw",
  multiple: "Multiple Draw",
  quick: "Quick Draw",
};
// Nhãn hiện trên chính nút Draw — THAY HẲN label cấu hình trong Properties Panel khi action = "draw"
// (field "Label" vẫn còn đó cho MỌI action khác, chỉ riêng Draw tự sinh nhãn theo mode/tiến trình,
// xem ButtonPanel.tsx's ghi chú cạnh field Label). "single" luôn cố định "Single Draw" — không có
// khái niệm tiến trình. "multiple" hiện `(current/total)` NGAY KHI đang chạy thật (batchProgress),
// còn lúc mới ARM (chưa bấm Draw) chỉ hiện tổng số sẽ quay `(total)`. "quick" LUÔN chỉ hiện `(total)`
// dù đang chạy hay chưa — Quick Draw không nghỉ giữa các lượt nên không có "current" nào đáng xem.
function drawButtonLabel(sequence: DrawSequenceActions | undefined): string {
  if (!sequence || sequence.drawMode === "single") return DRAW_MODE_LABELS.single;
  const total = sequence.batchProgress?.total ?? sequence.drawCount ?? 0;
  if (sequence.drawMode === "multiple") {
    return sequence.batchProgress
      ? `${DRAW_MODE_LABELS.multiple} (${sequence.batchProgress.current}/${total})`
      : `${DRAW_MODE_LABELS.multiple} (${total})`;
  }
  return `${DRAW_MODE_LABELS.quick} (${total})`;
}

// Dropdown mũi tên (▾) cạnh nút Draw — CHỈ hiện khi action = "draw" (xem ButtonView bên dưới). Đây
// là 1 BỘ CHỌN CHẾ ĐỘ (giống radio) chứ KHÔNG tự chạy draw — chọn "Multiple"/"Quick" mở popup hỏi số
// lượng (drawModePrompt, vẽ ở LandingRenderer.tsx), xác nhận xong chỉ ARM chế độ đó (dấu ✓ cạnh mục
// đang chọn), người vận hành phải tự bấm nút Draw CHÍNH để thật sự tiến hành quay theo đúng chế độ
// đã chọn (xem runAction's case "draw" ở trên). "Single Draw" set thẳng, không cần hỏi gì.
function DrawMenu({
  sequence,
  disabled,
  backgroundColor,
  color,
  borderRadius,
  strokeColor,
  strokeWidth,
}: {
  sequence: DrawSequenceActions;
  disabled: boolean;
  backgroundColor: string;
  color: string;
  borderRadius: number;
  strokeColor: string;
  strokeWidth: number;
}) {
  const [open, setOpen] = useState(false);
  // Mở LÊN TRÊN thay vì XUỐNG DƯỚI khi nút nằm gần mép dưới màn chiếu, không đủ chỗ cho menu (đã gặp
  // thật: nút Draw đặt gần đáy canvas làm menu bị trôi ra ngoài khung). Đo bằng getBoundingClientRect()
  // ngay lúc MỞ (không cần theo dõi resize liên tục — menu tự đóng khi click ra ngoài, mở lại là đo
  // lại) — trả về toạ độ ĐÃ tính theo mọi `transform: scale(...)` của tổ tiên (canvas Present Mode
  // luôn bị scale để vừa khung cửa sổ), nên so trực tiếp với window.innerHeight là đúng vị trí thật
  // trên màn hình, không cần tự quy đổi tỉ lệ scale.
  const [direction, setDirection] = useState<"up" | "down">("down");
  const arrowRef = useRef<HTMLButtonElement>(null);
  // Chiều cao ước lượng của menu (3 mục + padding trên/dưới) — chỉ dùng để SO SÁNH còn đủ chỗ hay
  // không, không cần chính xác tuyệt đối.
  const MENU_HEIGHT_ESTIMATE = 130;

  function toggleOpen() {
    if (!open && arrowRef.current) {
      const rect = arrowRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDirection(spaceBelow < MENU_HEIGHT_ESTIMATE ? "up" : "down");
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative h-full shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        ref={arrowRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        title="Choose draw mode"
        // DrawMenu chỉ được mount khi `sequence` đã có (xem showDrawMenu ở ButtonView bên dưới) —
        // khác nút CHÍNH (luôn render kể cả ở Builder canvas lúc !sequence), nên `disabled` ở ĐÂY chỉ
        // có thể do `locked`, dùng thẳng Tailwind `disabled:opacity-40` an toàn (không cần tách biệt
        // như nút chính).
        className="flex h-full w-8 items-center justify-center border-l border-black/10 text-xs shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          color,
          backgroundColor,
          borderTopRightRadius: borderRadius,
          borderBottomRightRadius: borderRadius,
          borderStyle: "solid",
          borderTopWidth: strokeWidth,
          borderBottomWidth: strokeWidth,
          borderRightWidth: strokeWidth,
          borderColor: strokeColor,
        }}
      >
        ▾
      </button>
      {open && (
        <div
          className={`absolute right-0 z-30 w-52 overflow-hidden rounded-lg border border-base-700 bg-base-950 py-1 text-left shadow-2xl ${
            direction === "up" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {DRAW_MODES.map((mode) => {
            const active = sequence.drawMode === mode;
            const suffix = mode !== "single" && active && sequence.drawCount ? ` — ${sequence.drawCount}` : "";
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setOpen(false);
                  sequence.selectDrawMode(mode);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-base-100 hover:bg-base-800"
              >
                <span>
                  {DRAW_MODE_LABELS[mode]}
                  {suffix}
                </span>
                {active && <span className="text-gold-500">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ButtonView({
  component,
  data,
  sequence,
}: {
  component: ButtonComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  const { action, label, fontSize, color, backgroundColor, borderRadius, strokeColor, strokeWidth } = component.props;
  // Khoá luôn khi đang `spinning` (Wheel đang quay — "gần như mọi chức năng" bị khoá tới lúc quay
  // xong, xem doc-comment DrawSequenceActions.spinning trong types.ts) hoặc `busy` (1 hành động ghi
  // DB đang chạy dở — xem useDrawSequence.ts) — cả 2 đều là khoá TẠM THỜI, KHÁC `!sequence` (Builder
  // canvas, chỉ đang xem trước bố cục, không phải "tạm khoá") dù cả 2 cùng set `disabled` gốc của
  // <button>. `locked` (không phải `disabled`) mới là điều kiện làm mờ nút (opacity, xem JSX bên
  // dưới) — CỐ Ý tách riêng để Builder canvas không bị mờ nhầm theo, chỉ Present Mode lúc thật sự
  // đang khoá mới mờ, để người vận hành biết ngay không cần di chuột vào mới thấy cursor đổi.
  // Multiple/Quick Draw giữ `spinning = true` SUỐT batch (xem useDrawSequence.ts) nên nút TỰ khoá +
  // mờ đúng lúc, không cần đọc thêm `batchProgress` ở đây cho việc khoá — chỉ cần nó cho label bên dưới.
  const locked = !!sequence && (sequence.busy || sequence.spinning);
  const disabled = !sequence || locked;
  const showDrawMenu = action === "draw" && !!sequence;

  // Nút Draw tự sinh nhãn theo mode/tiến trình (drawButtonLabel ở trên) — THAY HẲN label cấu hình,
  // đọc `sequence.batchProgress`/`drawMode` là state DÙNG CHUNG cho cả trang (không riêng theo Button
  // nào) nên PHẢI kèm `action === "draw"`, nếu không MỌI Button khác (Confirm/Reset/Scoreboard/Open
  // Link) cũng bị đổi nhầm theo dù chúng chỉ đang bị khoá lây (locked = true suốt batch), không hề
  // chạy gì cả — bug đã gặp thật (screenshot: cả 5 nút cùng hiện "Drawing… (1/5)").
  const displayLabel = action === "draw" ? drawButtonLabel(sequence) : label;

  function handleClick() {
    if (!sequence || locked) return;
    const confirmMessage = CONFIRM_MESSAGES[component.props.action];
    if (confirmMessage) {
      sequence.requestConfirm(confirmMessage, () => runAction(component, sequence, data));
      return;
    }
    runAction(component, sequence, data);
  }

  return (
    // LandingRenderer đặt pointer-events: none mặc định lên khung của MỌI component (tránh khung
    // trống của 1 component to đè lên nuốt mất click của component khác) — Button là loại DUY NHẤT
    // cần bắt click thật ở Present Mode nên tự bật lại pointer-events: auto ở đây.
    <div className="relative flex h-full w-full" style={{ pointerEvents: "auto" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={!sequence ? "Buttons are only active in Present Mode" : locked ? "Please wait…" : undefined}
        className="flex h-full flex-1 items-center justify-center font-medium shadow-lg transition-opacity disabled:cursor-not-allowed"
        style={{
          fontSize,
          color,
          backgroundColor,
          // Có dropdown cạnh phải (action = "draw") thì chỉ bo góc bên TRÁI — 2 nút trông liền khối,
          // giống 1 nút DUY NHẤT có thêm mũi tên, không phải 2 ô tách rời.
          borderTopLeftRadius: borderRadius,
          borderBottomLeftRadius: borderRadius,
          borderTopRightRadius: showDrawMenu ? 0 : borderRadius,
          borderBottomRightRadius: showDrawMenu ? 0 : borderRadius,
          borderStyle: "solid",
          borderWidth: strokeWidth,
          borderRightWidth: showDrawMenu ? 0 : strokeWidth,
          borderColor: strokeColor,
          // Mờ đi khi bị khoá TẠM THỜI (locked) — để biết đang disable mà không cần di chuột vào mới
          // thấy cursor đổi. KHÔNG dùng Tailwind `disabled:opacity-*` ở đây vì `disabled` còn TRUE cả
          // lúc `!sequence` (Builder canvas, chỉ đang xem trước bố cục, không phải "tạm khoá") — dùng
          // opacity đó sẽ làm nút luôn mờ trong Builder, sai hẳn ý "xem trước y hệt lúc trình chiếu".
          opacity: locked ? 0.4 : undefined,
        }}
      >
        {displayLabel}
      </button>
      {showDrawMenu && (
        <DrawMenu
          sequence={sequence!}
          disabled={disabled}
          backgroundColor={backgroundColor}
          color={color}
          borderRadius={borderRadius}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
        />
      )}
    </div>
  );
}
