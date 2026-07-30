import { Handle, Node, NodeProps, Position } from "@xyflow/react";

export interface ActionNodeData extends Record<string, unknown> {
  command: string; // tên tín hiệu theo quy ước "Component.Action" (vd "Wheel.StartSpin") — tự thân
  // đã đủ rõ nghĩa để hiển thị trực tiếp, không cần tra thêm 1 label riêng.
}

export type ActionGraphNode = Node<ActionNodeData, "actionNode">;

// Node "lệnh" nằm giữa 2 ComponentNode trên 1 line (source Button → cmd → target) — đại diện đúng
// 1 TriggerAction. Chỉ hiện tên tín hiệu, không biết/không hiện gì về hiệu ứng cụ thể của component
// đích — Graph là command bus, không tạo hiệu ứng (xem CLAUDE.md/plan).
export default function ActionNode({ data, selected }: NodeProps<ActionGraphNode>) {
  return (
    <div
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold shadow-lg ${
        selected ? "border-gold-500 bg-gold-500/10 text-gold-300" : "border-teal-600 bg-base-900 text-teal-600"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-teal-500" />
      {data.command}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-teal-500" />
    </div>
  );
}
