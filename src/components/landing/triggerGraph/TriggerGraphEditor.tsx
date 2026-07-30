import { useCallback, useEffect, useMemo, useState } from "react";
import { Background as FlowBackground, Controls, Edge, ReactFlow, ReactFlowProvider, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LandingComponent, LandingComponentType, LandingConfig, TriggerAction, TriggerGraphLayout, newTriggerActionId } from "@/lib/landing/types";
import { CanvasTool } from "../LandingCanvas";
import { COMPONENT_REGISTRY, COMPONENT_SIGNALS } from "../componentRegistry";
import ComponentNode, { ComponentGraphNode } from "./ComponentNode";
import ActionNode, { ActionGraphNode } from "./ActionNode";
import TriggerSidebar from "./TriggerSidebar";

type GraphNode = ComponentGraphNode | ActionGraphNode;
type Selection = { kind: "action"; cmdNodeId: string } | { kind: "target"; componentId: string } | null;

interface TriggerActionOwner {
  ownerId: string; // component.id giữ mảng triggerActions này (đích NHẬN lệnh)
  action: TriggerAction;
}

const NODE_TYPES = { componentNode: ComponentNode, actionNode: ActionNode };

interface TriggerGraphEditorProps {
  config: LandingConfig;
  onUpdateComponent: (id: string, patch: Partial<LandingComponent>) => void;
  onUpdateTriggerGraph: (patch: Partial<TriggerGraphLayout>) => void;
  // "hand" = chỉ pan, khoá hẳn chọn/kéo node — giống Hand tool của LandingCanvas.tsx, dùng chung 1
  // state với Canvas (xem LandingBuilderWindow.tsx).
  tool: CanvasTool;
}

// Chỉ những loại component CÓ mặt trong COMPONENT_SIGNALS (emits hoặc listensFor) mới tham gia
// Trigger Graph — Text/Image/Countdown/PrizeList/... không bao giờ là nguồn hay đích tín hiệu nên
// bị lọc bỏ hoàn toàn khỏi màn hình này, tránh rối mắt.
function isGraphEligible(type: LandingComponentType): boolean {
  return !!COMPONENT_SIGNALS[type];
}

function emitsEligibleSources(config: LandingConfig): { id: string; label: string }[] {
  return config.components
    .filter((c) => COMPONENT_SIGNALS[c.type]?.emits)
    .map((c) => ({ id: c.id, label: componentLabelOf(config, c.id) }));
}

function listensForEligibleTargets(config: LandingConfig): { id: string; label: string }[] {
  return config.components
    .filter((c) => COMPONENT_SIGNALS[c.type]?.listensFor)
    .map((c) => ({ id: c.id, label: componentLabelOf(config, c.id) }));
}

function componentTriggerActionsOf(config: LandingConfig, componentId: string): TriggerAction[] {
  return config.components.find((c) => c.id === componentId)?.triggerActions ?? [];
}

// Ưu tiên tên do người dùng tự đặt (component.name, xem SharedFields.tsx) — chỉ fallback về nhãn
// loại component khi chưa đặt tên, để nhận diện được khi trang có nhiều component CÙNG loại.
function componentLabelOf(config: LandingConfig, componentId: string): string {
  const component = config.components.find((c) => c.id === componentId);
  if (!component) return componentId;
  return component.name?.trim() || COMPONENT_REGISTRY[component.type].label;
}

// Mỗi TriggerAction trỏ tới ĐÚNG 1 component nguồn cụ thể (action.sourceComponentId, không phải
// dò theo action loại nữa) — nếu component nguồn đó bị xoá thì ẩn hẳn node lệnh + 2 edge của nó,
// dữ liệu TriggerAction vẫn giữ nguyên (không xoá) và tự hiện lại nếu component đó tồn tại lại.
function allOwnedTriggerActions(config: LandingConfig): TriggerActionOwner[] {
  const result: TriggerActionOwner[] = [];
  config.components.forEach((c) => {
    (c.triggerActions ?? []).forEach((action) => result.push({ ownerId: c.id, action }));
  });
  return result;
}

// Layout mặc định cho ComponentNode — 1 cột duy nhất — CHỈ dùng cho node nào chưa có vị trí đã lưu
// trong config.triggerGraph. Không ghi gì vào config ở đây — chỉ ghi thật khi người dùng kéo 1 node
// (xem handleNodeDragStop bên dưới).
function defaultComponentPosition(index: number): { x: number; y: number } {
  return { x: 80, y: index * 110 + 40 };
}

function buildComponentNodes(config: LandingConfig, componentIds: string[]): ComponentGraphNode[] {
  const positions = config.triggerGraph?.nodePositions ?? {};
  return componentIds.map((id, index) => {
    const component = config.components.find((c) => c.id === id)!;
    return {
      id,
      type: "componentNode",
      position: positions[id] ?? defaultComponentPosition(index),
      data: { label: componentLabelOf(config, id), type: component.type },
    };
  });
}

// Node lệnh (ActionNode) nằm giữa Button nguồn và component đích trên đúng 1 line — vị trí mặc định
// là TRUNG ĐIỂM giữa 2 ComponentNode đó, giống hệt cơ chế "1 line, 1 node ở giữa" tham khảo từ CDP
// journey builder.
function buildActionNodesAndEdges(
  config: LandingConfig,
  componentNodes: ComponentGraphNode[]
): { nodes: ActionGraphNode[]; edges: Edge[] } {
  const positions = config.triggerGraph?.nodePositions ?? {};
  const componentPosById = new Map(componentNodes.map((n) => [n.id, n.position]));
  const nodes: ActionGraphNode[] = [];
  const edges: Edge[] = [];

  allOwnedTriggerActions(config).forEach(({ ownerId, action }) => {
    const targetComponent = config.components.find((c) => c.id === ownerId);
    const sourcePos = componentPosById.get(action.sourceComponentId);
    const targetPos = componentPosById.get(ownerId);
    if (!targetComponent || !sourcePos || !targetPos) return; // nguồn/đích không còn tồn tại — ẩn, giữ nguyên dữ liệu

    const cmdId = `cmd-${action.id}`;
    nodes.push({
      id: cmdId,
      type: "actionNode",
      position: positions[cmdId] ?? { x: (sourcePos.x + targetPos.x) / 2, y: (sourcePos.y + targetPos.y) / 2 },
      data: { command: action.command },
    });

    const edgeStyle = { type: "straight" as const, style: { strokeDasharray: "6 4", stroke: "#8A8E99" } };
    edges.push({ id: `edge-src-${action.id}`, source: action.sourceComponentId, target: cmdId, ...edgeStyle });
    edges.push({ id: `edge-tgt-${action.id}`, source: cmdId, target: ownerId, ...edgeStyle });
  });

  return { nodes, edges };
}

function TriggerGraphEditorInner({ config, onUpdateComponent, onUpdateTriggerGraph, tool }: TriggerGraphEditorProps) {
  const componentIds = useMemo(
    () => config.components.filter((c) => isGraphEligible(c.type)).map((c) => c.id),
    [config.components]
  );
  const componentNodes = useMemo(() => buildComponentNodes(config, componentIds), [config, componentIds]);
  const { nodes: actionNodes, edges } = useMemo(() => buildActionNodesAndEdges(config, componentNodes), [
    config,
    componentNodes,
  ]);
  const allNodes = useMemo(() => [...componentNodes, ...actionNodes], [componentNodes, actionNodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>(allNodes);
  const [selection, setSelection] = useState<Selection>(null);

  // Đồng bộ lại danh sách node khi component/triggerActions đổi ở nơi khác, hoặc khi vị trí đã lưu
  // trong config.triggerGraph đổi — useNodesState vẫn giữ mượt việc kéo-thả cục bộ giữa các lần
  // đồng bộ này.
  useEffect(() => {
    setNodes(allNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes]);

  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: GraphNode) => {
      onUpdateTriggerGraph({
        nodePositions: { ...(config.triggerGraph?.nodePositions ?? {}), [node.id]: node.position },
      });
    },
    [config.triggerGraph, onUpdateTriggerGraph]
  );

  function handleCreateLink(targetComponentId: string, patch: { sourceComponentId: string; command: string; delayMs: number }) {
    const action: TriggerAction = { id: newTriggerActionId(), ...patch };
    const current = componentTriggerActionsOf(config, targetComponentId);
    onUpdateComponent(targetComponentId, { triggerActions: [...current, action] } as Partial<LandingComponent>);
    setSelection({ kind: "action", cmdNodeId: `cmd-${action.id}` });
  }

  function handleChangeAction(ownerId: string, actionId: string, patch: Partial<TriggerAction>) {
    const current = componentTriggerActionsOf(config, ownerId);
    onUpdateComponent(ownerId, {
      triggerActions: current.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
    } as Partial<LandingComponent>);
  }

  function handleDeleteAction(ownerId: string, actionId: string) {
    const current = componentTriggerActionsOf(config, ownerId);
    onUpdateComponent(ownerId, {
      triggerActions: current.filter((a) => a.id !== actionId),
    } as Partial<LandingComponent>);
    if (selection?.kind === "action" && selection.cmdNodeId === `cmd-${actionId}`) setSelection(null);
  }

  return (
    // Nền trắng (base-950 = trắng trong theme này, xem CLAUDE.md) — colorMode="light" ép ReactFlow
    // dùng bảng màu sáng cho chính nó thay vì tự theo "system" (mặc định) rồi vô tình ra tối nếu hệ
    // điều hành đang bật Dark Mode — khớp với màu các node card (đã là màu sáng).
    <div className="flex h-full w-full bg-base-950">
      <TriggerSidebar
        config={config}
        targetOptions={listensForEligibleTargets(config)}
        sourceOptions={emitsEligibleSources(config)}
        selectedActionId={selection?.kind === "action" ? selection.cmdNodeId.slice(4) : null}
        prefillTargetId={selection?.kind === "target" ? selection.componentId : undefined}
        onSelectAction={(actionId) => setSelection(actionId ? { kind: "action", cmdNodeId: `cmd-${actionId}` } : null)}
        onCreate={handleCreateLink}
        onChangeAction={handleChangeAction}
        onDeleteAction={handleDeleteAction}
      />
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          // Kéo-thả tạo kết nối (handle-to-handle) đã bị bỏ — người dùng thấy khó thao tác. Tạo link
          // giờ luôn qua TriggerSidebar bên trái.
          nodesConnectable={false}
          // Hand tool = chỉ pan, không chọn/kéo được node nào — giống hệt Hand tool của LandingCanvas.
          nodesDraggable={tool !== "hand"}
          elementsSelectable={tool !== "hand"}
          onNodeClick={(_, node) => {
            if (tool === "hand") return;
            if (node.type === "actionNode") setSelection({ kind: "action", cmdNodeId: node.id });
            else if (node.type === "componentNode" && COMPONENT_SIGNALS[(node as ComponentGraphNode).data.type]?.listensFor)
              setSelection({ kind: "target", componentId: node.id });
            else setSelection(null);
          }}
          onPaneClick={() => setSelection(null)}
          onNodeDragStop={handleNodeDragStop}
          colorMode="light"
          style={{ backgroundColor: "#FFFFFF" }}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <FlowBackground color="#D8DBE3" />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

// Node = 1 component thật (Button emits, Lucky Wheel/Fireworks/Stage Light listensFor tín hiệu
// riêng — xem COMPONENT_SIGNALS trong componentRegistry.ts). Tạo/sửa/xoá link luôn qua
// TriggerSidebar.tsx (sidebar trái, luôn hiện) — click 1 pill (ActionNode) hay 1 node đích trên
// canvas chỉ là lối tắt để mở/điền sẵn đúng link đó trong sidebar, không bắt buộc. Ghi thẳng vào
// config thật qua onUpdateComponent — Trigger Graph dùng chung 1 Save/Discard với cả Builder (xem
// LandingBuilderWindow.tsx), không có draft/Save/Discard riêng của màn hình này nữa. Chỉ vị trí các
// node trên khung graph (config.triggerGraph) là dữ liệu mới, phục vụ riêng cho màn hình này.
export default function TriggerGraphEditor(props: TriggerGraphEditorProps) {
  return (
    <ReactFlowProvider>
      <TriggerGraphEditorInner {...props} />
    </ReactFlowProvider>
  );
}
