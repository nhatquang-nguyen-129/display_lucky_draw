import { LandingComponent, LandingComponentType, LandingConfig, LandingData } from "@/lib/landing/types";
import "./landingEffects.css";
import TextView from "./views/TextView";
import ImageView from "./views/ImageView";
import LuckyWheelView from "./views/LuckyWheelView";
import WinnerNameView from "./views/WinnerNameView";
import PrizeNameView from "./views/PrizeNameView";
import PrizeImageView from "./views/PrizeImageView";
import PrizeListView from "./views/PrizeListView";
import CountdownView from "./views/CountdownView";
import CurrentTimeView from "./views/CurrentTimeView";
import ParticipantCountView from "./views/ParticipantCountView";

interface LandingRendererProps {
  config: LandingConfig;
  data?: LandingData;
  scale: number;
}

// Các loại component "động" đơn giản (không tự quản lý animation state như luckyWheel) được remount
// mỗi khi có kết quả quay MỚI, để hiệu ứng entrance (fadeIn/slideUp...) tự bắn lại — không cần thêm
// timer/JS nào khác. luckyWheel KHÔNG nằm trong danh sách này vì nó tự quản lý animation quay liên
// tục qua state nội bộ, remount sẽ làm mất góc quay hiện tại.
const REMOUNT_ON_RESULT_TYPES = new Set<LandingComponentType>(["winnerName", "prizeName", "prizeImage"]);

// Painter thuần, chỉ đọc — không có state, không có tương tác. Dùng chung nguyên vẹn bởi
// LandingCanvas (lớp nền trong Builder) và PresentMode (toàn màn hình) để 2 nơi không bao giờ
// lệch pixel nhau — chỉ có 1 hàm biết cách vẽ mỗi loại component (renderComponent bên dưới).
export default function LandingRenderer({ config, data, scale }: LandingRendererProps) {
  const { width, height, background } = config.canvas;
  const sorted = [...config.components].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      className="relative overflow-hidden"
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
      {sorted.map((component) => {
        const resultKey = data?.results[0]?.id ?? "empty";
        const key = REMOUNT_ON_RESULT_TYPES.has(component.type) ? `${component.id}-${resultKey}` : component.id;
        return (
          <div
            key={key}
            className={`landing-effect-${component.effect} absolute`}
            style={{ left: component.x, top: component.y, width: component.width, height: component.height }}
          >
            {renderComponent(component, data)}
          </div>
        );
      })}
    </div>
  );
}

function renderComponent(component: LandingComponent, data?: LandingData) {
  switch (component.type) {
    case "text":
      return <TextView component={component} />;
    case "image":
      return <ImageView component={component} />;
    case "luckyWheel":
      return <LuckyWheelView component={component} data={data} />;
    case "winnerName":
      return <WinnerNameView component={component} data={data} />;
    case "prizeName":
      return <PrizeNameView component={component} data={data} />;
    case "prizeImage":
      return <PrizeImageView component={component} data={data} />;
    case "prizeList":
      return <PrizeListView component={component} data={data} />;
    case "countdown":
      return <CountdownView component={component} />;
    case "currentTime":
      return <CurrentTimeView component={component} />;
    case "participantCount":
      return <ParticipantCountView component={component} data={data} />;
    default:
      return null;
  }
}
