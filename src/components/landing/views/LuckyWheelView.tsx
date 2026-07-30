import { DrawSequenceActions, LandingData, LuckyWheelComponent } from "@/lib/landing/types";
import WheelTemplate from "../luckyWheelTemplates/WheelTemplate";
import DigitRollerTemplate from "../luckyWheelTemplates/DigitRollerTemplate";

// Dispatcher theo `props.template` — mỗi template tự quản lý animation/state riêng (cơ chế quay
// tròn khác hẳn cơ chế nhấp nháy số nên không gộp chung logic), chỉ dùng chung phần binding dữ
// liệu (LandingData) và các field cấu hình chung trong LuckyWheelProps. `sequence` chỉ có ở Present
// Mode thật (undefined trong Builder) — mỗi template tự đọc component.triggerActions của CHÍNH nó
// qua useTriggerCommands.ts để biết khi nào bắt đầu quay (tín hiệu "WheelSpinStart"), không tự
// quay theo cơ chế implicit cũ nữa.
// Thêm template mới: thêm giá trị vào `LuckyWheelTemplate` (lib/landing/types.ts) + 1 file trong
// luckyWheelTemplates/ + 1 case ở đây + option tương ứng trong LuckyWheelPanel.tsx.
export default function LuckyWheelView({
  component,
  data,
  sequence,
}: {
  component: LuckyWheelComponent;
  data?: LandingData;
  sequence?: DrawSequenceActions;
}) {
  switch (component.props.template) {
    case "digitRoller":
      return <DigitRollerTemplate component={component} data={data} sequence={sequence} />;
    case "wheel":
    default:
      return <WheelTemplate component={component} data={data} sequence={sequence} />;
  }
}
