import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { LandingComponentType } from "@/lib/landing/types";
import { COMPONENT_SIGNALS } from "../componentRegistry";
import ComponentTypeIcon from "../componentIcons";

export interface ComponentNodeData extends Record<string, unknown> {
  label: string;
  type: LandingComponentType;
}

export type ComponentGraphNode = Node<ComponentNodeData, "componentNode">;

// Node đại diện 1 component thật trên landing — icon + tên, không có chấm hiện ra (khác hẳn kiểu
// cũ). Có tới 2 Handle VÔ HÌNH (isConnectable=false, chỉ đóng vai trò điểm neo), tuỳ component là
// Emitter/Receiver/CẢ HAI (ngoại lệ hẹp — xem COMPONENT_SIGNALS trong componentRegistry.ts, vd Lucky
// Wheel vừa listensFor "Wheel.StartSpin" vừa emits "Wheel.SpinCompleted"):
//   - "owner-emit" (bên PHẢI) — neo đường "sở hữu" sang các chip EMIT của nó (đặt bên phải).
//   - "owner-listen" (bên TRÁI) — neo đường "sở hữu" sang các chip LISTEN của nó (đặt bên trái).
// Cả 2 đều type="source" (đường "sở hữu" luôn dựng theo chiều component → chip, xem buildOwnerEdges
// trong TriggerGraphEditor.tsx) — nếu để "target" thì edge không tìm ra handle "source" nào khớp,
// đường sẽ không vẽ được (đã gặp thật với Lucky Wheel lúc mới thêm handle này). Component Node
// không tự nối dây thật được (connectable=false ở cấp node, xem TriggerGraphEditor).
//
// CHIỀU CAO CỐ ĐỊNH (`h-24` = 96px, khớp CHÍNH XÁC với COMPONENT_NODE_FALLBACK_SIZE.height trong
// TriggerGraphEditor.tsx) — bắt buộc, không để tự co giãn theo nội dung như trước. TriggerGraphEditor
// tính vị trí Y của mỗi chip dựa trên TÂM DỌC của component chủ bằng chính hằng số này (không đo
// DOM thật để tránh vòng phụ thuộc ngược giữa layout ↔ trạng thái node của react-flow) — nếu chiều
// cao node lại co giãn theo tên dài/xuống dòng thì hằng số sẽ sai, khiến đường "sở hữu" bị chéo dù
// code tính toán đúng. `truncate` trên tên chặn xuống dòng (dài quá thì "…", không đẩy box cao lên).
export default function ComponentNode({ data, selected }: NodeProps<ComponentGraphNode>) {
  const signals = COMPONENT_SIGNALS[data.type];
  const isEmitter = !!signals?.emits;
  const isReceiver = !!signals?.listensFor;

  return (
    <div
      className={`flex h-24 w-28 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center shadow-lg ${
        selected ? "border-gold-500 bg-gold-500/10 text-gold-300" : "border-base-700 bg-base-900 text-base-100"
      }`}
    >
      {isEmitter && (
        <Handle
          id="owner-emit"
          type="source"
          position={Position.Right}
          isConnectable={false}
          className="!h-px !w-px !border-0 !bg-transparent !opacity-0"
        />
      )}
      {isReceiver && (
        <Handle
          id="owner-listen"
          type="source"
          position={Position.Left}
          isConnectable={false}
          className="!h-px !w-px !border-0 !bg-transparent !opacity-0"
        />
      )}
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${selected ? "bg-gold-500/20" : "bg-base-800"}`}>
        <ComponentTypeIcon type={data.type} />
      </div>
      <div className="w-full truncate text-xs font-medium leading-tight">{data.label}</div>
    </div>
  );
}
