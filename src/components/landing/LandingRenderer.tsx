import {
  computeWheelRevealDelayMs,
  DrawSequenceActions,
  LandingComponent,
  LandingComponentType,
  LandingConfig,
  LandingData,
} from "@/lib/landing/types";
import Button from "@/components/Button";
import "./landingEffects.css";
import BackgroundDimOverlay from "./views/BackgroundDimOverlay";
import EscapeKeyHandler from "./views/EscapeKeyHandler";
import TextView from "./views/TextView";
import ImageView from "./views/ImageView";
import LuckyWheelView from "./views/LuckyWheelView";
import WinnerNameView from "./views/WinnerNameView";
import PrizeNameView from "./views/PrizeNameView";
import PrizeImageView from "./views/PrizeImageView";
import PrizeListView from "./views/PrizeListView";
import PrizeGalleryView from "./views/PrizeGalleryView";
import CountdownView from "./views/CountdownView";
import CurrentTimeView from "./views/CurrentTimeView";
import ParticipantCountView from "./views/ParticipantCountView";
import ButtonView from "./views/ButtonView";
import ScoreboardView from "./views/ScoreboardView";

interface LandingRendererProps {
  config: LandingConfig;
  data?: LandingData;
  scale: number;
  // Chỉ true ở Present Mode thật — Builder canvas không truyền (mặc định false) nên Button luôn
  // disabled ở đó, tránh bấm nhầm chạy quay số thật lúc đang chỉnh sửa (xem ButtonView.tsx).
  interactive?: boolean;
  sequence?: DrawSequenceActions;
  // Mặc định LUÔN true (kể cả không truyền) — clip nội dung đúng khung width/height thật, tuyệt đối
  // bắt buộc ở Present Mode VÀ ở LandingPage.tsx (preview read-only trong cửa sổ chính, phải giống
  // hệt buổi trình chiếu thật). CHỈ LandingCanvas.tsx (preview bên trong chính màn hình Builder, nơi
  // người dùng đang kéo-thả) truyền `clip={false}` — để 1 component đang đặt ở "bàn nháp" ngoài
  // khung thật (xem PASTEBOARD_MARGIN_RATIO) vẫn thấy được nội dung/màu sắc thật của nó thay vì bị
  // cắt mất, trong khi Present Mode/LandingPage.tsx vẫn clip bình thường, không ảnh hưởng gì.
  clip?: boolean;
}

// Các loại component "động" đơn giản (không tự quản lý animation state như luckyWheel) được remount
// mỗi khi có kết quả quay MỚI, để hiệu ứng entrance (fadeIn/slideUp...) tự bắn lại — không cần thêm
// timer/JS nào khác. luckyWheel KHÔNG nằm trong danh sách này vì nó tự quản lý animation quay liên
// tục qua state nội bộ, remount sẽ làm mất góc quay hiện tại.
const REMOUNT_ON_RESULT_TYPES = new Set<LandingComponentType>(["winnerName", "prizeName", "prizeImage"]);

// Painter thuần, chỉ đọc — không có state, không có tương tác. Dùng chung nguyên vẹn bởi
// LandingCanvas (lớp nền trong Builder) và PresentMode (toàn màn hình) để 2 nơi không bao giờ
// lệch pixel nhau — chỉ có 1 hàm biết cách vẽ mỗi loại component (renderComponent bên dưới).

export default function LandingRenderer({ config, data, scale, interactive, sequence, clip = true }: LandingRendererProps) {
  const { width, height, background } = config.canvas;
  // Ở Present Mode thật (interactive), Scoreboard KHÔNG vẽ trong vòng lặp per-component bình thường
  // ở khung x/y/width/height của nó — nó là 1 popup canh giữa màn hình, chỉ hiện khi được 1 Button
  // "showScoreboard" bật lên (xem khối riêng sau vòng lặp bên dưới). Ở Builder (không interactive)
  // thì NGƯỢC LẠI vẫn để nó nằm trong vòng lặp bình thường, vẽ đúng tại x/y như mọi component khác —
  // để khung chọn/kéo-thả/resize của LandingCanvas.tsx (tính hoàn toàn độc lập từ x/y/width/height,
  // không biết gì về cách LandingRenderer vẽ) luôn khớp với vị trí hiển thị thật, tránh lặp lại đúng
  // bug "khung kéo-thả lệch khỏi nội dung thật" đã từng gặp với Digit Roller. Riêng field
  // `hiddenInBuilder` (bật/tắt qua LayersPanel.tsx, lưu thẳng trong config) ẩn hẳn 1 component khỏi
  // Builder bất kể loại gì — CHỈ áp dụng khi KHÔNG interactive, Present Mode luôn bỏ qua field này.
  const sorted = [...config.components]
    .sort((a, b) => a.zIndex - b.zIndex)
    .filter((c) => !(interactive && c.type === "scoreboard"))
    .filter((c) => !(!interactive && c.hiddenInBuilder));
  const scoreboards = config.components.filter(
    (c): c is Extract<LandingComponent, { type: "scoreboard" }> => c.type === "scoreboard"
  );
  // Khoảng WinnerNameView (xem file đó) phải CHỜ trước khi hiện tên thật — bằng đúng thời lượng Lucky
  // Wheel trên trang quay xong hẳn, 0 nếu trang không có Wheel nào. Tính 1 lần cho cả trang (không
  // theo riêng từng WinnerName) vì chỉ phụ thuộc cấu hình Wheel, không phụ thuộc bản thân WinnerName.
  const winnerRevealDelayMs = computeWheelRevealDelayMs(config.components);
  // `clip={false}` là tín hiệu RIÊNG LandingCanvas.tsx đã dùng sẵn để tự nhận diện "đây là canvas kéo
  // thả của Builder" (xem doc-comment `clip` trong LandingRendererProps) — dùng LẠI đúng tín hiệu này
  // cho WinnerNameView thay vì suy luận qua `interactive`, vì LandingPage.tsx (preview read-only ở
  // cửa sổ chính) CŨNG không interactive nhưng phải hiện đúng fallbackText/tên thật như Present Mode
  // thật, không được lẫn với chữ giữ chỗ chỉ dành riêng cho Builder.
  const builderPreview = clip === false;

  return (
    <div
      className={`relative ${clip ? "overflow-hidden" : ""}`}
      style={{
        width,
        height,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        backgroundColor: background.color,
        backgroundImage:
          background.type === "image" && background.imageDataUrl ? `url(${background.imageDataUrl})` : undefined,
        backgroundSize:
          background.imageFit === "contain" ? "contain" : background.imageFit === "stretch" ? "100% 100%" : "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* CHỈ ở Present Mode thật (interactive) — Builder không cần thấy nền tối dần đi trong lúc đang
          chỉnh sửa, dù bản thân overlay tự bất hoạt (return null) khi tính năng tắt hoặc chưa có kết
          quả nào. Render TRƯỚC {sorted.map(...)} để luôn nằm DƯỚI mọi component (chỉ dim background,
          không dim nội dung nổi trên nó) — xem BackgroundDimOverlay.tsx. */}
      {interactive && (
        <BackgroundDimOverlay background={background} data={data} winnerRevealDelayMs={winnerRevealDelayMs} />
      )}

      {sorted.map((component) => {
        const resultKey = data?.results[0]?.id ?? "empty";
        const key = REMOUNT_ON_RESULT_TYPES.has(component.type) ? `${component.id}-${resultKey}` : component.id;
        return (
          <div
            key={key}
            className={`landing-effect-${component.effect} absolute`}
            style={{
              left: component.x,
              top: component.y,
              width: component.width,
              height: component.height,
              // Component nào cũng có khung kéo-thả (x/y/width/height) THƯỜNG to hơn hẳn nội dung
              // thật vẽ ra (vd Text/Wheel canh giữa trong khung, phần trống xung quanh) — mặc định
              // KHÔNG bắt click trên khung, chỉ nội dung thật mới bắt (tránh 1 component to đè lên,
              // nuốt mất click của component khác nằm dưới/cạnh nó — đã gặp thật với Wheel đè lên
              // Button). "button" là loại DUY NHẤT thực sự cần bắt click ở Present Mode, tự bật lại
              // pointer-events: auto cho đúng khung của nó — xem ButtonView.tsx.
              pointerEvents: "none",
            }}
          >
            {renderComponent(component, data, interactive, sequence, winnerRevealDelayMs, builderPreview)}
          </div>
        );
      })}

      {/* CHỈ ở Present Mode thật (interactive) và khi sequence.scoreboardVisible đang bật (1 Button
          "showScoreboard" đã được bấm) — vẽ đè lên trên cùng, canh giữa toàn bộ canvas, phủ 1 lớp
          nền tối phía sau để rõ đây là 1 cửa sổ phụ. Kích cỡ khung bên trong CỐ ĐỊNH bằng đúng
          width/height đã kéo-thả cho nó, không dùng x/y ở đây (x/y chỉ có ý nghĩa cho vị trí hiển
          thị TĨNH lúc chỉnh sửa trong Builder, xem nhánh trong `sorted` ở trên). */}
      {interactive &&
        sequence?.scoreboardVisible &&
        scoreboards.map((c) => (
          <div
            key={c.id}
            className="absolute inset-0 flex items-center justify-center bg-black/60"
            style={{ pointerEvents: "auto" }}
          >
            {/* Popup Confirm/Reset (bên dưới) đè LÊN TRÊN Scoreboard (z-50 so với không z-index ở
                đây) nếu vô tình mở cùng lúc — Esc lúc đó chỉ nên đóng đúng popup ĐANG NỔI TRÊN CÙNG,
                không đóng cả 2 cùng lúc, nên bỏ qua handler này khi confirmPrompt cũng đang mở. */}
            {!sequence.confirmPrompt && <EscapeKeyHandler onEscape={sequence.hideScoreboard} />}
            <div style={{ width: c.width, height: c.height }}>
              <ScoreboardView component={c} data={data} onClose={sequence.hideScoreboard} />
            </div>
          </div>
        ))}

      {/* Popup xác nhận cho action "confirm"/"reset" của Button (ghi dữ liệu THẬT, VĨNH VIỄN — xem
          docs/landing-builder.md mục 6) — CHỈ ở Present Mode thật, khi sequence.confirmPrompt đang
          có giá trị (ButtonView.tsx gọi sequence.requestConfirm() thay vì chạy action ngay). Click
          nền tối (ngoài thẻ) hoặc bấm Esc = Cancel, giống hành vi đóng modal thông thường. z-50 để
          LUÔN nổi trên cả Scoreboard nếu 2 popup vô tình mở cùng lúc. */}
      {interactive && sequence?.confirmPrompt && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
          style={{ pointerEvents: "auto" }}
          onClick={() => sequence.resolveConfirmPrompt(false)}
        >
          <EscapeKeyHandler onEscape={() => sequence.resolveConfirmPrompt(false)} />
          <div
            className="w-[420px] max-w-[90%] rounded-xl bg-base-950 p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-medium text-base-100">{sequence.confirmPrompt.message}</p>
            <div className="mt-5 flex justify-center gap-3">
              <Button variant="secondary" onClick={() => sequence.resolveConfirmPrompt(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => sequence.resolveConfirmPrompt(true)}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Popup "hết hàng" — CHỈ ở Present Mode thật, khi sequence.outOfStockPrizeName đang có giá trị
          (PrizeGalleryView.tsx gọi notifyOutOfStock() khi click 1 ảnh giải đã xám, hoặc
          useDrawSequence.ts tự set khi giải ĐANG CHỌN vừa hết hàng — xem đó). Dismiss-only (chỉ có
          nút OK, không có lựa chọn Confirm/Cancel nào khác) — click nền tối hoặc Esc cũng đóng, cùng
          kiểu với popup confirmPrompt ở trên. */}
      {interactive && sequence?.outOfStockPrizeName && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
          style={{ pointerEvents: "auto" }}
          onClick={sequence.dismissOutOfStock}
        >
          <EscapeKeyHandler onEscape={sequence.dismissOutOfStock} />
          <div
            className="w-[420px] max-w-[90%] rounded-xl bg-base-950 p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-medium text-base-100">
              "{sequence.outOfStockPrizeName}" is out of stock.
            </p>
            <div className="mt-5 flex justify-center">
              <Button onClick={sequence.dismissOutOfStock}>OK</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderComponent(
  component: LandingComponent,
  data?: LandingData,
  interactive?: boolean,
  sequence?: DrawSequenceActions,
  winnerRevealDelayMs?: number,
  builderPreview?: boolean
) {
  switch (component.type) {
    case "text":
      return <TextView component={component} />;
    case "image":
      return <ImageView component={component} />;
    case "luckyWheel":
      return <LuckyWheelView component={component} data={data} />;
    case "winnerName":
      return (
        <WinnerNameView
          component={component}
          data={data}
          builderPreview={builderPreview}
          revealDelayMs={winnerRevealDelayMs}
        />
      );
    case "prizeName":
      return <PrizeNameView component={component} data={data} />;
    case "prizeImage":
      return <PrizeImageView component={component} data={data} sequence={interactive ? sequence : undefined} />;
    case "prizeList":
      return <PrizeListView component={component} data={data} />;
    case "prizeGallery":
      return <PrizeGalleryView component={component} data={data} sequence={interactive ? sequence : undefined} />;
    case "countdown":
      return <CountdownView component={component} />;
    case "currentTime":
      return <CurrentTimeView component={component} />;
    case "participantCount":
      return <ParticipantCountView component={component} data={data} />;
    case "button":
      return <ButtonView component={component} data={data} sequence={interactive ? sequence : undefined} />;
    case "scoreboard":
      // Chỉ tới đây khi KHÔNG interactive (Builder) — ở Present Mode, scoreboard đã bị lọc khỏi
      // `sorted` phía trên và vẽ riêng như overlay canh giữa, xem khối sau vòng lặp map() chính.
      return <ScoreboardView component={component} data={data} />;
    default:
      return null;
  }
}
