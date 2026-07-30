import { LandingData, ScoreboardComponent } from "@/lib/landing/types";
import TableTemplate from "../scoreboardTemplates/TableTemplate";

// Dispatcher theo `props.template` — đúng kiểu LuckyWheelView.tsx dispatch theo LuckyWheelTemplate.
// Thêm template mới: thêm giá trị vào ScoreboardTemplate (lib/landing/types.ts) + 1 file trong
// scoreboardTemplates/ + 1 case ở đây.
export default function ScoreboardView({
  component,
  data,
  onClose,
}: {
  component: ScoreboardComponent;
  data?: LandingData;
  onClose?: () => void;
}) {
  switch (component.props.template) {
    case "table":
    default:
      return <TableTemplate component={component} data={data} onClose={onClose} />;
  }
}
