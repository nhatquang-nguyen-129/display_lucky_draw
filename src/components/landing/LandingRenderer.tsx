import { DrawSequenceActions, LandingComponent, LandingComponentType, LandingConfig, LandingData } from "@/lib/landing/types";
import { ReactionTarget, useActiveReactions } from "./useActiveReactions";
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
import ButtonView from "./views/ButtonView";

interface LandingRendererProps {
  config: LandingConfig;
  data?: LandingData;
  scale: number;
  // Chỉ true ở Present Mode thật — Builder canvas không truyền (mặc định false) nên Button luôn
  // disabled ở đó, tránh bấm nhầm chạy quay số thật lúc đang chỉnh sửa (xem ButtonView.tsx).
  interactive?: boolean;
  sequence?: DrawSequenceActions;
}

// Các loại component "động" đơn giản (không tự quản lý animation state như luckyWheel) được remount
// mỗi khi có kết quả quay MỚI, để hiệu ứng entrance (fadeIn/slideUp...) tự bắn lại — không cần thêm
// timer/JS nào khác. luckyWheel KHÔNG nằm trong danh sách này vì nó tự quản lý animation quay liên
// tục qua state nội bộ, remount sẽ làm mất góc quay hiện tại.
const REMOUNT_ON_RESULT_TYPES = new Set<LandingComponentType>(["winnerName", "prizeName", "prizeImage"]);

// Painter thuần, chỉ đọc — không có state, không có tương tác. Dùng chung nguyên vẹn bởi
// LandingCanvas (lớp nền trong Builder) và PresentMode (toàn màn hình) để 2 nơi không bao giờ
// lệch pixel nhau — chỉ có 1 hàm biết cách vẽ mỗi loại component (renderComponent bên dưới).
const BACKGROUND_REACTION_ID = "__background__";

export default function LandingRenderer({ config, data, scale, interactive, sequence }: LandingRendererProps) {
  const { width, height, background } = config.canvas;
  const sorted = [...config.components].sort((a, b) => a.zIndex - b.zIndex);
  const hasWheel = config.components.some((c) => c.type === "luckyWheel");

  // Chỉ tính active reactions khi interactive (Present Mode thật) — Builder canvas không có
  // lastTrigger nào từng nổ ra nên luôn rỗng, mọi component hiện đúng trạng thái tĩnh lúc chỉnh sửa.
  const reactionTargets: ReactionTarget[] = interactive
    ? [
        { id: BACKGROUND_REACTION_ID, reactions: background.reactions ?? [] },
        ...config.components.map((c) => ({ id: c.id, reactions: c.reactions ?? [] })),
      ]
    : [];
  const activeReactions = useActiveReactions(reactionTargets, interactive ? sequence?.lastTrigger ?? null : null);
  // "scale"/"glow" không có ý nghĩa rõ ràng ở cấp cả trang nền (zoom toàn bộ canvas là hành vi lạ) —
  // background reaction chỉ áp dụng "dim" (lớp phủ tối), scale/glow chỉ dùng cho từng component.
  const backgroundDim = activeReactions.get(BACKGROUND_REACTION_ID)?.dim;

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
      {backgroundDim !== undefined && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{ backgroundColor: `rgba(0,0,0,${backgroundDim})` }}
        />
      )}

      {sorted.map((component) => {
        const resultKey = data?.results[0]?.id ?? "empty";
        const key = REMOUNT_ON_RESULT_TYPES.has(component.type) ? `${component.id}-${resultKey}` : component.id;
        const reaction = activeReactions.get(component.id);
        return (
          <div
            key={key}
            className={`landing-effect-${component.effect} absolute transition-transform duration-500`}
            style={{
              left: component.x,
              top: component.y,
              width: component.width,
              height: component.height,
              transform: reaction?.scale ? `scale(${reaction.scale})` : undefined,
              boxShadow: reaction?.glow ? `0 0 24px 8px ${reaction.glowColor ?? "#FFCA2D"}` : undefined,
              // Component nào cũng có khung kéo-thả (x/y/width/height) THƯỜNG to hơn hẳn nội dung
              // thật vẽ ra (vd Text/Wheel canh giữa trong khung, phần trống xung quanh) — mặc định
              // KHÔNG bắt click trên khung, chỉ nội dung thật mới bắt (tránh 1 component to đè lên,
              // nuốt mất click của component khác nằm dưới/cạnh nó — đã gặp thật với Wheel đè lên
              // Button). "button" là loại DUY NHẤT thực sự cần bắt click ở Present Mode, tự bật lại
              // pointer-events: auto cho đúng khung của nó — xem ButtonView.tsx.
              pointerEvents: "none",
            }}
          >
            {renderComponent(component, data, interactive, sequence, hasWheel)}
            {reaction?.dim !== undefined && (
              <div
                className="pointer-events-none absolute inset-0 transition-opacity duration-500"
                style={{ backgroundColor: `rgba(0,0,0,${reaction.dim})` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderComponent(
  component: LandingComponent,
  data?: LandingData,
  interactive?: boolean,
  sequence?: DrawSequenceActions,
  hasWheel?: boolean
) {
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
    case "button":
      return (
        <ButtonView component={component} data={data} sequence={interactive ? sequence : undefined} hasWheel={hasWheel} />
      );
    default:
      return null;
  }
}
