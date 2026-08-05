import { Handle, Node, NodeProps, Position } from "@xyflow/react";

export interface SignalChipNodeData extends Record<string, unknown> {
  signal: string; // vd "Button.Click", "Wheel.StartSpin"
  role: "emit" | "listen";
  onDelete: () => void;
}

export type SignalChipGraphNode = Node<SignalChipNodeData, "signalChipNode">;

// 1 "chip tín hiệu" — đại diện đúng 1 SignalChipPlacement, kéo từ TriggerSidebar.tsx thả vào 1
// Component Node để "đặt ra" điểm nối cho tín hiệu đó (chưa chắc đã nối dây với chip nào khác).
// Mỗi chip có 2 Handle:
//   - "signal" (CÓ MÀU, người dùng kéo tay để nối dây thật) — role="emit" thì nằm bên PHẢI (source,
//     phát tín hiệu ra); role="listen" thì nằm bên TRÁI (target, nhận tín hiệu vào).
//   - "owner" (VÔ HÌNH, isConnectable=false — chỉ để neo đường line "sở hữu" tự vẽ từ chính
//     Component Node của nó, xem TriggerGraphEditor.tsx) — luôn nằm ở cạnh ĐỐI DIỆN với "signal",
//     vì component chủ luôn đặt ở phía đó (xem defaultChipPosition trong TriggerGraphEditor.tsx).
// Nối dây thật (kéo giữa 2 handle "signal" của 2 chip khác nhau) mới tạo ra TriggerAction.
export default function SignalChipNode({ data, selected }: NodeProps<SignalChipGraphNode>) {
  const isEmit = data.role === "emit";
  return (
    <div
      className={`relative rounded-full border px-3 py-1 text-[11px] font-semibold shadow-lg ${
        selected
          ? "border-gold-500 bg-gold-500/10 text-gold-300"
          : isEmit
            ? "border-teal-600 bg-base-900 text-teal-600"
            : "border-gold-500 bg-base-900 text-gold-500"
      }`}
    >
      {isEmit ? (
        <Handle
          id="owner"
          type="target"
          position={Position.Left}
          isConnectable={false}
          className="!h-px !w-px !border-0 !bg-transparent !opacity-0"
        />
      ) : (
        <Handle
          id="owner"
          type="target"
          position={Position.Right}
          isConnectable={false}
          className="!h-px !w-px !border-0 !bg-transparent !opacity-0"
        />
      )}

      {!isEmit && <Handle id="signal" type="target" position={Position.Left} className="!h-2 !w-2 !bg-gold-500" />}
      {data.signal}
      {isEmit && <Handle id="signal" type="source" position={Position.Right} className="!h-2 !w-2 !bg-teal-500" />}

      {selected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete();
          }}
          title="Remove this signal chip"
          className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border border-danger-500 bg-base-950 text-[9px] text-danger-500 hover:bg-danger-500/20"
        >
          ×
        </button>
      )}
    </div>
  );
}
