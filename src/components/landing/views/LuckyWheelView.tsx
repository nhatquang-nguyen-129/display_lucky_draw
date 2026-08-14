import { LandingData, LuckyWheelComponent } from "@/lib/landing/types";
import WheelTemplate from "../luckyWheelTemplates/WheelTemplate";
import DigitRollerTemplate from "../luckyWheelTemplates/DigitRollerTemplate";

// Dispatcher theo `props.template` — mỗi template tự quản lý animation/state riêng (cơ chế quay
// tròn khác hẳn cơ chế nhấp nháy số nên không gộp chung logic), chỉ dùng chung phần binding dữ
// liệu (LandingData) và các field cấu hình chung trong LuckyWheelProps. Mỗi template tự phát hiện
// có candidate MỚI (data.results[0].id đổi) rồi tự bắt đầu quay — không cần `sequence` nào cả.
// Thêm template mới: thêm giá trị vào `LuckyWheelTemplate` (lib/landing/types.ts) + 1 file trong
// luckyWheelTemplates/ + 1 case ở đây + option tương ứng trong LuckyWheelPanel.tsx.
export default function LuckyWheelView({ component, data }: { component: LuckyWheelComponent; data?: LandingData }) {
  switch (component.props.template) {
    case "digitRoller":
      return <DigitRollerTemplate component={component} data={data} />;
    case "wheel":
    default:
      return <WheelTemplate component={component} data={data} />;
  }
}
