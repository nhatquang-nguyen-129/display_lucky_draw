import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { LandingComponentType } from "@/lib/landing/types";
import { COMPONENT_SIGNALS } from "../componentRegistry";
import ComponentTypeIcon from "./componentIcons";

export interface ComponentNodeData extends Record<string, unknown> {
  label: string;
  type: LandingComponentType;
}

export type ComponentGraphNode = Node<ComponentNodeData, "componentNode">;

// Node DUY NHẤT cho cả Trigger Graph đại diện 1 component thật trên landing — icon phía trên, tên
// bên dưới, gần với phong cách CDP tham khảo. Handle "source" (bên phải) chỉ hiện nếu TYPE này là
// Signal EMITTER (có "emits" trong COMPONENT_SIGNALS — hiện tại chỉ Button); handle "target" (bên
// trái) chỉ hiện nếu TYPE này là Signal RECEIVER (có "listensFor" — Lucky Wheel/Fireworks/Stage
// Light) — 1 component chỉ thuộc ĐÚNG 1 trong 2 nhóm, không bao giờ có cả emits lẫn listensFor cùng
// lúc (xem nguyên tắc Emitter/Receiver ở CLAUDE.md).
export default function ComponentNode({ data, selected }: NodeProps<ComponentGraphNode>) {
  const signals = COMPONENT_SIGNALS[data.type];
  const emits = signals?.emits;
  const listensFor = signals?.listensFor;

  return (
    <div
      className={`flex w-28 flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center shadow-lg ${
        selected ? "border-gold-500 bg-gold-500/10 text-gold-300" : "border-base-700 bg-base-900 text-base-100"
      }`}
    >
      {listensFor && <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-gold-500" />}
      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${selected ? "bg-gold-500/20" : "bg-base-800"}`}>
        <ComponentTypeIcon type={data.type} />
      </div>
      <div className="text-xs font-medium leading-tight">{data.label}</div>
      {emits && <div className="text-[10px] font-normal text-teal-600">Emits: {emits.join(", ")}</div>}
      {emits && <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-teal-500" />}
    </div>
  );
}
