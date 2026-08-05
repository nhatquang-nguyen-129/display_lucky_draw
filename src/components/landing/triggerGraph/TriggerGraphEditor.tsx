import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background as FlowBackground,
  Connection,
  Controls,
  Edge,
  OnNodeDrag,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useViewport,
  ViewportPortal,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  LandingComponent,
  LandingComponentType,
  LandingConfig,
  SignalChipPlacement,
  TriggerAction,
  TriggerGraphLayout,
  newTriggerActionId,
} from "@/lib/landing/types";
import { CanvasTool } from "../LandingCanvas";
import { COMPONENT_REGISTRY, COMPONENT_SIGNALS } from "../componentRegistry";
import ComponentNode, { ComponentGraphNode } from "./ComponentNode";
import SignalChipNode, { SignalChipGraphNode } from "./SignalChipNode";
import TriggerSidebar, { SIGNAL_DRAG_MIME } from "./TriggerSidebar";

type GraphNode = ComponentGraphNode | SignalChipGraphNode;

const NODE_TYPES = { componentNode: ComponentNode, signalChipNode: SignalChipNode };

// Đơn vị lưới dùng chung (px) — bội số gốc cho các hằng số layout bên dưới
// (RANK_GAP/ROW_HEIGHT/CHIP_OFFSET), khoảng cách chấm nền (Background gap), VÀ snapToGrid lúc kéo
// tay (mọi node LUÔN dừng đúng 1 ô lưới, xem <ReactFlow> bên dưới).
const GRID_SIZE = 40;
// Khoảng cách giữa 2 "rank" (cột) liên tiếp — đủ rộng để 1 chip Emit (bên phải component rank N)
// và 1 chip Listen (bên trái component rank N+1) không bao giờ chồng nhau, kể cả với tên tín hiệu
// dài nhất hiện có (vd "Wheel.SpinCompleted", chip rộng tới ~180px do là pill co giãn theo chữ).
// CHỈ dùng làm vị trí MẶC ĐỊNH cho 1 node chưa từng bị kéo tay (xem computeComponentRanks/Lanes).
const RANK_GAP = GRID_SIZE * 18;
// Khoảng cách giữa 2 "lane" (hàng) liên tiếp — đủ chỗ cho 1 Component Node + vài chip xếp dọc.
const ROW_HEIGHT = GRID_SIZE * 5;
// Khoảng lệch từ tâm component chủ ra chip của nó — dùng chung cho chipPositionOf bên dưới.
const CHIP_OFFSET = GRID_SIZE * 4;
// `height` ở đây KHÔNG PHẢI ước lượng — Component Node có chiều cao CỐ ĐỊNH cứng bằng `h-24` (96px)
// trong ComponentNode.tsx, và Signal Chip Node luôn 1 dòng chữ nên chiều cao thực tế ổn định quanh
// 26px — dùng thẳng làm hằng số cho CENTER_Y_OFFSET/chipCenterY (căn tâm dọc chip theo component chủ,
// xem bên dưới) thay vì đọc `node.measured` để tránh vòng phụ thuộc ngược (chip cần biết chiều cao
// component TRƯỚC khi component kịp render/đo xong). `width` vẫn chỉ là ước lượng — dùng cho "smart
// guide" lúc kéo (xem computeDragSnap), ưu tiên `node.measured?.width` thật khi có.
const COMPONENT_NODE_FALLBACK_SIZE = { width: 112, height: 96 };
const CHIP_NODE_FALLBACK_SIZE = { width: 140, height: 26 };
// Ngưỡng bắt dính vào 1 node khác lúc kéo, tính theo px MÀN HÌNH (chia cho zoom hiện tại để cảm
// giác bắt dính giữ nguyên dù đang zoom in/out) — cùng kỹ thuật với CENTER_SNAP_PX của
// LandingCanvas.tsx, chỉ khác là so khớp với node gần nhất thay vì 1 tâm canvas cố định.
const GUIDE_SNAP_PX = 8;

interface TriggerGraphEditorProps {
  config: LandingConfig;
  onUpdateComponent: (id: string, patch: Partial<LandingComponent>) => void;
  onUpdateTriggerGraph: (patch: Partial<TriggerGraphLayout>) => void;
  // "hand" = chỉ pan, khoá hẳn chọn/kéo/nối node — giống Hand tool của LandingCanvas.tsx, dùng
  // chung 1 state với Canvas (xem LandingBuilderWindow.tsx).
  tool: CanvasTool;
  // Dùng chung 1 state `showGrid` với LandingCanvas.tsx — 1 nút Gridline duy nhất bật/tắt lưới nền
  // ở CẢ 2 màn hình (mỗi màn hình tự vẽ lưới bằng cơ chế riêng của nó).
  showGrid: boolean;
}

// Chỉ những loại component CÓ mặt trong COMPONENT_SIGNALS (emits hoặc listensFor) mới tham gia
// Trigger Graph — Text/Image/Countdown/PrizeList/... không bao giờ là nguồn hay đích tín hiệu nên
// bị lọc bỏ hoàn toàn khỏi màn hình này, tránh rối mắt.
function isGraphEligible(type: LandingComponentType): boolean {
  return !!COMPONENT_SIGNALS[type];
}

// Ưu tiên tên do người dùng tự đặt (component.name, xem SharedFields.tsx) — chỉ fallback về nhãn
// loại component khi chưa đặt tên, để nhận diện được khi trang có nhiều component CÙNG loại.
function componentLabelOf(config: LandingConfig, componentId: string): string {
  const component = config.components.find((c) => c.id === componentId);
  if (!component) return componentId;
  return component.name?.trim() || COMPONENT_REGISTRY[component.type].label;
}

// 1 tín hiệu có hợp lệ với ĐÚNG loại component này không, và nếu có thì vai trò gì (emit hay
// listen) — nguồn tra DUY NHẤT là COMPONENT_SIGNALS, không có tín hiệu tự đặt tên tuỳ ý.
function signalRoleOf(type: LandingComponentType, signal: string): "emit" | "listen" | null {
  const signals = COMPONENT_SIGNALS[type];
  if (signals?.emits?.includes(signal)) return "emit";
  if (signals?.listensFor?.includes(signal)) return "listen";
  return null;
}

function chipId(ownerComponentId: string, signal: string): string {
  return `${ownerComponentId}::${signal}`;
}

function componentTriggerActionsOf(config: LandingConfig, componentId: string): TriggerAction[] {
  return config.components.find((c) => c.id === componentId)?.triggerActions ?? [];
}

interface TriggerActionOwner {
  ownerId: string; // component.id giữ mảng triggerActions này (đích NHẬN lệnh)
  action: TriggerAction;
}

function allTriggerActions(config: LandingConfig): TriggerActionOwner[] {
  const result: TriggerActionOwner[] = [];
  config.components.forEach((c) => {
    (c.triggerActions ?? []).forEach((action) => result.push({ ownerId: c.id, action }));
  });
  return result;
}

// Rank (cột) của 1 component — 0 nếu KHÔNG có TriggerAction nào của component khác nhắm vào nó,
// ngược lại = 1 + rank lớn nhất trong các component NGUỒN đang kích hoạt nó. Vd Button (rank 0) →
// Lucky Wheel (rank 1, do Button.Click nối sang Wheel.StartSpin) → Fireworks (rank 2, do
// Wheel.SpinCompleted nối sang Fireworks.Play) — đúng thứ tự trái→phải của chuỗi tín hiệu thật,
// không phải thứ tự component được thêm vào trang.
function computeComponentRanks(config: LandingConfig, componentIds: string[]): Map<string, number> {
  const idSet = new Set(componentIds);
  const incomingSources = new Map<string, string[]>();
  config.components.forEach((c) => {
    (c.triggerActions ?? []).forEach((a) => {
      if (!idSet.has(a.sourceComponentId) || !idSet.has(c.id)) return;
      incomingSources.set(c.id, [...(incomingSources.get(c.id) ?? []), a.sourceComponentId]);
    });
  });

  const ranks = new Map<string, number>();
  function rankOf(id: string, visiting: Set<string>): number {
    const cached = ranks.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // vòng lặp — UI hiện tại không tạo ra được, chỉ chặn đệ quy vô hạn cho an toàn
    visiting.add(id);
    const rank = (incomingSources.get(id) ?? []).reduce((max, sourceId) => Math.max(max, rankOf(sourceId, visiting) + 1), 0);
    visiting.delete(id);
    ranks.set(id, rank);
    return rank;
  }
  componentIds.forEach((id) => rankOf(id, new Set()));
  return ranks;
}

// Lane (hàng) của 1 component — mặc định GIỮ NGUYÊN lane của component nguồn đã kích hoạt nó (giữ cả
// chuỗi chính nằm thẳng 1 hàng ngang, giống "trunk" của journey builder tham khảo), trừ khi lane đó
// đã có component khác cùng rank chiếm mất thì rơi xuống lane trống tiếp theo — tự nhiên tái hiện
// đúng kiểu rẽ nhánh "1 nguồn → nhiều đích, đích đầu ở lại trunk, đích sau tụt xuống hàng dưới".
function computeComponentLanes(config: LandingConfig, componentIds: string[], ranks: Map<string, number>): Map<string, number> {
  const incomingSources = new Map<string, string[]>();
  config.components.forEach((c) => {
    (c.triggerActions ?? []).forEach((a) => {
      incomingSources.set(c.id, [...(incomingSources.get(c.id) ?? []), a.sourceComponentId]);
    });
  });

  const lanes = new Map<string, number>();
  const usedLanesByRank = new Map<number, Set<number>>();
  [...componentIds]
    .sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0))
    .forEach((id) => {
      const rank = ranks.get(id) ?? 0;
      const used = usedLanesByRank.get(rank) ?? new Set<number>();
      const sourceLanes = (incomingSources.get(id) ?? []).map((s) => lanes.get(s)).filter((l): l is number => l !== undefined);
      let lane = sourceLanes.length > 0 ? Math.min(...sourceLanes) : 0;
      while (used.has(lane)) lane++;
      used.add(lane);
      usedLanesByRank.set(rank, used);
      lanes.set(id, lane);
    });
  return lanes;
}

// Vị trí mặc định của 1 Component Node CHƯA từng bị kéo tay — bội số của GRID_SIZE ngay từ đầu (xem
// computeComponentRanks/computeComponentLanes).
function buildComponentNodes(config: LandingConfig, componentIds: string[]): ComponentGraphNode[] {
  const saved = config.triggerGraph?.nodePositions ?? {};
  const ranks = computeComponentRanks(config, componentIds);
  const lanes = computeComponentLanes(config, componentIds, ranks);
  return componentIds.map((id) => {
    const component = config.components.find((c) => c.id === id)!;
    return {
      id,
      type: "componentNode",
      position: saved[id] ?? { x: (ranks.get(id) ?? 0) * RANK_GAP, y: (lanes.get(id) ?? 0) * ROW_HEIGHT },
      data: { label: componentLabelOf(config, id), type: component.type },
      // Component Node không tự nối dây được — chỉ là điểm neo cho đường "sở hữu" tự vẽ sang mỗi
      // chip của nó (xem buildOwnerEdges bên dưới) và điểm thả chip vào (handleDrop).
      connectable: false,
    };
  });
}

// Vị trí MẶC ĐỊNH của 1 chip CHƯA từng bị kéo tay — tính từ vị trí (đã lưu hoặc mặc định) của
// component chủ — neo bên PHẢI component chủ nếu là chip Emit (khớp handle "signal" của nó ở bên
// phải, chừa bên trái cho dây nối thật ra chip Listen khác), bên TRÁI nếu là chip Listen (khớp
// handle "signal" ở bên trái) — xem comment ở đầu SignalChipNode.tsx. Xếp dọc xuống dưới theo
// GRID_SIZE nếu component có nhiều chip cùng phía (vd Fireworks có cả Fireworks.Play lẫn
// Fireworks.Stop), tránh chồng lên nhau.
//
// `ownerPos.y` là toạ độ CẠNH TRÊN của Component Node (node.position luôn là góc trên-trái, không
// phải tâm) — Component Node cao hơn hẳn Signal Chip Node (icon+tên ~96px vs 1 dòng chữ ~26px), nên
// nếu chip lấy thẳng `ownerPos.y` làm y của chính nó thì 2 handle (đều tự căn giữa theo CHIỀU CAO
// RIÊNG của từng node) sẽ lệch nhau đúng bằng nửa hiệu chiều cao — khiến đường "sở hữu" (xem
// buildOwnerEdges) bị chéo thay vì thẳng ngang tuyệt đối dù trông "có vẻ" đã thẳng hàng. Cộng thêm
// `centerYOffset` để chip THẬT SỰ neo theo TÂM DỌC của component chủ, không phải cạnh trên của nó.
const CENTER_Y_OFFSET = (COMPONENT_NODE_FALLBACK_SIZE.height - CHIP_NODE_FALLBACK_SIZE.height) / 2;

// Tâm dọc BẮT BUỘC của 1 chip — LUÔN bằng tâm dọc component chủ (cộng thêm bậc thang nếu component
// có nhiều chip cùng phía). Đây không phải "vị trí mặc định" nữa mà là RÀNG BUỘC CỐ ĐỊNH — chip
// không tự kéo lệch trục dọc được (xem chipNodes/handleNodeDrag bên dưới), chỉ trục ngang mới kéo
// tự do, đảm bảo đường "sở hữu" LUÔN là 1 đường ngang tuyệt đối, không bao giờ có thể bị lệch dù
// kéo tay thế nào — khác hẳn cách tiếp cận cũ (chỉ đúng lúc CHƯA từng bị kéo, kéo lệch 1 lần là vỡ).
function chipCenterY(
  chip: SignalChipPlacement,
  chips: SignalChipPlacement[],
  componentPosById: Map<string, { x: number; y: number }>
): number {
  const ownerPos = componentPosById.get(chip.ownerComponentId) ?? { x: 0, y: 0 };
  // Bậc thang chỉ tính trong CÙNG VAI TRÒ (emit xếp riêng, listen xếp riêng) — chip emit và chip
  // listen của CÙNG 1 component (ngoại lệ hẹp, vd Lucky Wheel) nằm 2 CỘT khác nhau (phải/trái, xem
  // defaultChipPosition), không phải cùng 1 cột dọc nên không được cộng dồn bậc thang lẫn nhau. Nếu
  // gộp chung sẽ khiến chip thứ 2 xuất hiện (bất kể vai trò gì) bị đẩy lệch tâm, đường "sở hữu" của
  // đúng chip đó bị chéo dù chỉ có 1 chip mỗi bên (đã gặp thật với Wheel.StartSpin/Wheel.SpinCompleted).
  const sameOwnerIndex = chips
    .filter((c) => c.ownerComponentId === chip.ownerComponentId && c.role === chip.role)
    .findIndex((c) => c.id === chip.id);
  return ownerPos.y + CENTER_Y_OFFSET + Math.max(0, sameOwnerIndex) * GRID_SIZE;
}

function defaultChipPosition(
  chip: SignalChipPlacement,
  chips: SignalChipPlacement[],
  componentPosById: Map<string, { x: number; y: number }>
): { x: number; y: number } {
  const ownerPos = componentPosById.get(chip.ownerComponentId) ?? { x: 0, y: 0 };
  const xOffset = chip.role === "emit" ? CHIP_OFFSET : -CHIP_OFFSET;
  return { x: ownerPos.x + xOffset, y: chipCenterY(chip, chips, componentPosById) };
}

interface DragBox {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

function nodeToDragBox(node: GraphNode): DragBox {
  const fallback = node.type === "componentNode" ? COMPONENT_NODE_FALLBACK_SIZE : CHIP_NODE_FALLBACK_SIZE;
  const width = node.measured?.width ?? fallback.width;
  const height = node.measured?.height ?? fallback.height;
  return { id: node.id, left: node.position.x, top: node.position.y, width, height };
}

// "Smart guide" lúc kéo 1 node — so khớp cạnh trái/tâm/cạnh phải (trục X) và cạnh trên/tâm/cạnh
// dưới (trục Y) của node đang kéo với TỪNG node khác đang có trên canvas, độc lập theo từng trục
// (giống centerGuides của LandingCanvas.tsx, chỉ khác là so với node gần nhất thay vì 1 tâm canvas
// cố định vì Trigger Graph là canvas vô hạn, không có kích thước cố định để lấy tâm). Khớp trong
// ngưỡng `GUIDE_SNAP_PX / zoom` thì bắt dính đúng giá trị đó và trả về toạ độ vẽ đường guide; không
// khớp trục nào thì trục đó giữ nguyên vị trí kéo thô, không có guide.
interface AxisMatch {
  delta: number; // lệch giữa dragged và other tại đặc điểm này — càng nhỏ càng ưu tiên
  snapped: number; // toạ độ left/top đã bắt dính của node đang kéo
  guide: number; // toạ độ (x hoặc y) để vẽ đường guide — chính là vị trí cạnh/tâm dùng để so khớp
}

function bestAxisMatch(candidates: AxisMatch[], threshold: number): AxisMatch | null {
  return candidates
    .filter((c) => Math.abs(c.delta) < threshold)
    .reduce<AxisMatch | null>((best, c) => (!best || Math.abs(c.delta) < Math.abs(best.delta) ? c : best), null);
}

function computeDragSnap(
  dragged: DragBox,
  others: DragBox[],
  zoom: number
): { position: { x: number; y: number }; guides: { x: number | null; y: number | null } } {
  const threshold = GUIDE_SNAP_PX / zoom;
  const myCenterX = dragged.left + dragged.width / 2;
  const myCenterY = dragged.top + dragged.height / 2;
  const myRight = dragged.left + dragged.width;
  const myBottom = dragged.top + dragged.height;

  const xCandidates: AxisMatch[] = [];
  const yCandidates: AxisMatch[] = [];
  others.forEach((other) => {
    const otherCenterX = other.left + other.width / 2;
    const otherRight = other.left + other.width;
    const otherCenterY = other.top + other.height / 2;
    const otherBottom = other.top + other.height;

    xCandidates.push(
      { delta: dragged.left - other.left, snapped: other.left, guide: other.left }, // trái-trái
      { delta: myCenterX - otherCenterX, snapped: otherCenterX - dragged.width / 2, guide: otherCenterX }, // tâm-tâm
      { delta: myRight - otherRight, snapped: otherRight - dragged.width, guide: otherRight } // phải-phải
    );
    yCandidates.push(
      { delta: dragged.top - other.top, snapped: other.top, guide: other.top }, // trên-trên
      { delta: myCenterY - otherCenterY, snapped: otherCenterY - dragged.height / 2, guide: otherCenterY }, // tâm-tâm
      { delta: myBottom - otherBottom, snapped: otherBottom - dragged.height, guide: otherBottom } // dưới-dưới
    );
  });

  const bestX = bestAxisMatch(xCandidates, threshold);
  const bestY = bestAxisMatch(yCandidates, threshold);
  return {
    position: { x: bestX ? bestX.snapped : dragged.left, y: bestY ? bestY.snapped : dragged.top },
    guides: { x: bestX ? bestX.guide : null, y: bestY ? bestY.guide : null },
  };
}

// Đường "sở hữu" (nét liền, mờ) tự vẽ từ MỌI Component Node sang từng chip của chính nó — thuần
// hiển thị (không selectable/focusable, không phải TriggerAction) để luôn thấy rõ chip nào thuộc
// component nào, kể cả khi chip CHƯA nối dây với gì. Khác hẳn đường nét đứt đậm hơn của 1
// TriggerAction thật (xem buildActionEdges) để phân biệt "sở hữu" với "đang hoạt động". sourceHandle
// chọn theo VAI TRÒ của chip ("owner-emit" hay "owner-listen", xem ComponentNode.tsx) — 1 component
// vừa Emitter vừa Receiver (ngoại lệ hẹp, vd Lucky Wheel) có CẢ 2 handle cùng lúc, mỗi chip của nó
// phải neo đúng handle khớp với phía nó đang đứng.
function buildOwnerEdges(chips: SignalChipPlacement[]): Edge[] {
  return chips.map((chip) => ({
    id: `owner-${chip.id}`,
    source: chip.ownerComponentId,
    sourceHandle: chip.role === "emit" ? "owner-emit" : "owner-listen",
    target: chip.id,
    targetHandle: "owner",
    type: "straight",
    style: { stroke: "#D8DBE3", strokeWidth: 1.5 },
    selectable: false,
    focusable: false,
  }));
}

function TriggerGraphEditorInner({ config, onUpdateComponent, onUpdateTriggerGraph, tool, showGrid }: TriggerGraphEditorProps) {
  const chips = config.triggerGraph?.signalChips ?? [];
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 4000);
  }
  useEffect(() => () => {
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
  }, []);

  const componentIds = useMemo(
    () => config.components.filter((c) => isGraphEligible(c.type)).map((c) => c.id),
    [config.components]
  );
  const componentNodes = useMemo(() => buildComponentNodes(config, componentIds), [config, componentIds]);
  const componentPosById = useMemo(() => new Map(componentNodes.map((n) => [n.id, n.position])), [componentNodes]);

  function handleDeleteChip(chip: SignalChipPlacement) {
    onUpdateTriggerGraph({ signalChips: chips.filter((c) => c.id !== chip.id) });
    // Xoá chip kéo theo mọi TriggerAction đang dùng nó (làm nguồn hoặc làm đích) — không thì 1 link
    // sẽ mất hẳn điểm neo để vẽ, dữ liệu mồ côi không còn ý nghĩa gì.
    config.components.forEach((c) => {
      const current = c.triggerActions ?? [];
      const filtered = current.filter((a) =>
        chip.role === "emit"
          ? !(a.sourceComponentId === chip.ownerComponentId && a.sourceSignal === chip.signal)
          : !(c.id === chip.ownerComponentId && a.command === chip.signal)
      );
      if (filtered.length !== current.length) {
        onUpdateComponent(c.id, { triggerActions: filtered } as Partial<LandingComponent>);
      }
    });
  }

  const chipNodes: SignalChipGraphNode[] = useMemo(() => {
    const saved = config.triggerGraph?.nodePositions ?? {};
    return chips.map((chip) => {
      const fallback = defaultChipPosition(chip, chips, componentPosById);
      return {
        id: chip.id,
        type: "signalChipNode",
        // X đọc vị trí đã lưu nếu có (kéo ngang để né chồng lấn/dễ nhìn) — Y THÌ KHÔNG, luôn tự
        // tính lại theo chipCenterY() bất kể có gì đã lưu hay không, đảm bảo đường "sở hữu" luôn
        // thẳng tuyệt đối (xem comment ở chipCenterY bên trên).
        position: { x: saved[chip.id]?.x ?? fallback.x, y: fallback.y },
        data: { signal: chip.signal, role: chip.role, onDelete: () => handleDeleteChip(chip) },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, componentPosById]);

  const allNodes = useMemo(() => [...componentNodes, ...chipNodes], [componentNodes, chipNodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>(allNodes);

  const edges = useMemo(() => {
    const chipIds = new Set(chips.map((c) => c.id));
    const edgeStyle = { type: "straight" as const, style: { strokeDasharray: "6 4", stroke: "#8A8E99" } };
    const actionEdges: Edge[] = [];
    allTriggerActions(config).forEach(({ ownerId, action }) => {
      const sourceChipId = chipId(action.sourceComponentId, action.sourceSignal);
      const targetChipId = chipId(ownerId, action.command);
      if (!chipIds.has(sourceChipId) || !chipIds.has(targetChipId)) return; // chip nguồn/đích không còn — ẩn, giữ nguyên dữ liệu
      actionEdges.push({
        id: `edge-${action.id}`,
        source: sourceChipId,
        sourceHandle: "signal",
        target: targetChipId,
        targetHandle: "signal",
        ...edgeStyle,
      });
    });
    // Đường "sở hữu" vẽ TRƯỚC (nằm dưới) để đường TriggerAction thật (đậm/đứt) luôn nổi rõ hơn ở trên.
    return [...buildOwnerEdges(chips), ...actionEdges];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Đồng bộ lại danh sách node khi component/chip đổi ở nơi khác (thêm/xoá component, kéo chip mới
  // ra...) — useNodesState vẫn giữ mượt việc kéo-thả cục bộ giữa các lần đồng bộ này.
  useEffect(() => {
    setNodes(allNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes]);

  const { zoom } = useViewport();
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  // Kéo 1 node (Component Node hoặc Signal Chip Node) — so khớp với mọi node khác đang có để bắt
  // dính vào cạnh/tâm gần nhất (xem computeDragSnap) và hiện đường guide đỏ tương ứng, giống hệt
  // cách LandingCanvas.tsx bắt dính vào tâm canvas lúc kéo component, chỉ khác điểm so khớp là node
  // gần nhất thay vì 1 tâm cố định (Trigger Graph là canvas vô hạn, không có kích thước để lấy tâm).
  const handleNodeDrag: OnNodeDrag<GraphNode> = (_event, node, allDraggedNodes) => {
    const draggedIds = new Set(allDraggedNodes.map((n) => n.id));
    const others = nodes.filter((n) => !draggedIds.has(n.id)).map(nodeToDragBox);
    const { position, guides: nextGuides } = computeDragSnap(nodeToDragBox(node), others, zoom);

    // Signal Chip Node khoá cứng trục dọc theo tâm component chủ ngay TRONG lúc kéo (không chỉ lúc
    // lưu) — nếu không, người dùng sẽ thấy chip "kéo được" theo trục dọc rồi lại tự bật ngược về
    // đúng vị trí ngay khi buông chuột (do chipNodes luôn tự tính lại Y, xem chipCenterY), gây khó
    // hiểu. Khoá sẵn từ lúc kéo thì hành vi lúc kéo và lúc buông LUÔN khớp nhau.
    const chip = node.type === "signalChipNode" ? chips.find((c) => c.id === node.id) : undefined;
    const lockedY = chip ? chipCenterY(chip, chips, componentPosById) : null;
    const finalPosition = lockedY === null ? position : { x: position.x, y: lockedY };
    const finalGuides = lockedY === null ? nextGuides : { x: nextGuides.x, y: null };

    setGuides(finalGuides);
    setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: finalPosition } : n)));
  };

  // Lưu vị trí sau khi kéo xong (đã bắt dính từ handleNodeDrag) vào config.triggerGraph.nodePositions
  // — chỉ ghi khi thật sự kéo tay, không ảnh hưởng gì tới vị trí mặc định (rank/lane) của các node
  // khác chưa từng bị đụng tới.
  function handleNodeDragStop(_event: MouseEvent | TouchEvent, node: GraphNode) {
    setGuides({ x: null, y: null });
    onUpdateTriggerGraph({
      nodePositions: { ...(config.triggerGraph?.nodePositions ?? {}), [node.id]: node.position },
    });
  }

  // Nối dây thật giữa 2 chip (kéo từ chấm chip Emit sang chấm chip Listen) — đây là hành động DUY
  // NHẤT tạo ra 1 TriggerAction. Mọi tổ hợp không hợp lệ đều báo lỗi chi tiết thay vì âm thầm bỏ qua.
  function handleConnect(connection: Connection) {
    const sourceChip = chips.find((c) => c.id === connection.source);
    const targetChip = chips.find((c) => c.id === connection.target);
    if (!sourceChip || !targetChip) return;
    if (sourceChip.role !== "emit" || targetChip.role !== "listen") {
      showNotice("You can only connect from an Emit chip to a Listen chip.");
      return;
    }
    if (sourceChip.ownerComponentId === targetChip.ownerComponentId) {
      showNotice("A component can't be wired to itself.");
      return;
    }
    const existing = componentTriggerActionsOf(config, targetChip.ownerComponentId);
    const alreadyLinked = existing.some(
      (a) => a.sourceComponentId === sourceChip.ownerComponentId && a.sourceSignal === sourceChip.signal && a.command === targetChip.signal
    );
    if (alreadyLinked) {
      showNotice(`"${sourceChip.signal}" is already connected to "${targetChip.signal}".`);
      return;
    }
    const action: TriggerAction = {
      id: newTriggerActionId(),
      sourceComponentId: sourceChip.ownerComponentId,
      sourceSignal: sourceChip.signal,
      command: targetChip.signal,
      delayMs: 0,
    };
    onUpdateComponent(targetChip.ownerComponentId, { triggerActions: [...existing, action] } as Partial<LandingComponent>);
  }

  // Kéo 1 chip từ TriggerSidebar.tsx thả vào canvas — chỉ hợp lệ khi thả ĐÚNG vào 1 Component Node
  // có hỗ trợ tín hiệu đó (đúng vai trò emit/listen), và component đó CHƯA có sẵn chip này. Dùng
  // document.elementFromPoint + .closest(".react-flow__node") để biết chính xác thả vào node nào
  // (data-id trên node wrapper = id thật của node, đã kiểm chứng trực tiếp trong bundle
  // @xyflow/react đang cài).
  function handleDrop(e: React.DragEvent) {
    const raw = e.dataTransfer.getData(SIGNAL_DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    let payload: { signal: string; role: "emit" | "listen" };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetNodeId = el?.closest(".react-flow__node")?.getAttribute("data-id");
    const targetComponent = config.components.find((c) => c.id === targetNodeId);
    if (!targetComponent) {
      showNotice(`Drop "${payload.signal}" onto a component on the canvas, not empty space.`);
      return;
    }
    const role = signalRoleOf(targetComponent.type, payload.signal);
    const targetLabel = componentLabelOf(config, targetComponent.id);
    if (!role || role !== payload.role) {
      showNotice(`"${payload.signal}" doesn't apply to "${targetLabel}" (${COMPONENT_REGISTRY[targetComponent.type].label}).`);
      return;
    }
    const newChipId = chipId(targetComponent.id, payload.signal);
    if (chips.some((c) => c.id === newChipId)) {
      showNotice(`"${targetLabel}" already has a "${payload.signal}" chip.`);
      return;
    }
    onUpdateTriggerGraph({
      signalChips: [...chips, { id: newChipId, ownerComponentId: targetComponent.id, signal: payload.signal, role: payload.role }],
    });
  }

  return (
    // Nền trắng (base-950 = trắng trong theme này, xem CLAUDE.md) — colorMode="light" ép ReactFlow
    // dùng bảng màu sáng cho chính nó thay vì tự theo "system" (mặc định) rồi vô tình ra tối nếu hệ
    // điều hành đang bật Dark Mode — khớp với màu các node card (đã là màu sáng).
    <div className="flex h-full w-full bg-base-950">
      <TriggerSidebar
        config={config}
        onChangeAction={(ownerId, actionId, patch) => {
          const current = componentTriggerActionsOf(config, ownerId);
          onUpdateComponent(ownerId, {
            triggerActions: current.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
          } as Partial<LandingComponent>);
        }}
        onDeleteAction={(ownerId, actionId) => {
          const current = componentTriggerActionsOf(config, ownerId);
          onUpdateComponent(ownerId, {
            triggerActions: current.filter((a) => a.id !== actionId),
          } as Partial<LandingComponent>);
        }}
      />
      <div className="relative min-h-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onConnect={handleConnect}
          // Chỉ chip mới nối dây được — Component Node có `connectable: false` riêng (xem
          // buildComponentNodes) nên dù global bật cũng không tự kéo-nối trực tiếp được, Handle vô
          // hình của nó (xem ComponentNode.tsx) chỉ dùng để neo đường "sở hữu" tự vẽ, không tương tác.
          nodesConnectable={tool !== "hand"}
          nodesDraggable={tool !== "hand"}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          // Luôn bắt dính vào lưới GRID_SIZE lúc kéo tay (độc lập với showGrid — showGrid chỉ bật/tắt
          // lưới NHÌN THẤY, xem <FlowBackground> bên dưới, giống hệt cách center-snap của
          // LandingCanvas.tsx luôn bật bất kể showGrid ở đó).
          snapToGrid
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          elementsSelectable={tool !== "hand"}
          colorMode="light"
          style={{ backgroundColor: "#FFFFFF" }}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          {showGrid && <FlowBackground color="#D8DBE3" gap={GRID_SIZE} />}
          <Controls />
          {/* Đường "smart guide" đỏ lúc kéo node bắt dính vào node khác (xem computeDragSnap) — vẽ
              qua ViewportPortal để tự pan/zoom theo đúng canvas, không cần tự quy đổi toạ độ màn
              hình. Độ dài cố định khá lớn — đủ phủ hết mọi vị trí thực tế của 1 landing page (vài
              component), không cần đo kích thước canvas thật (Trigger Graph vốn là canvas vô hạn). */}
          <ViewportPortal>
            {guides.x !== null && (
              <div className="pointer-events-none absolute bg-danger-500" style={{ left: guides.x, top: -10000, width: 1, height: 20000 }} />
            )}
            {guides.y !== null && (
              <div className="pointer-events-none absolute bg-danger-500" style={{ top: guides.y, left: -10000, height: 1, width: 20000 }} />
            )}
          </ViewportPortal>
        </ReactFlow>

        {/* Thông báo lỗi kéo-thả/nối dây — tự biến mất sau 4s, giống centerNotice của
            LandingBuilderWindow.tsx nhưng cục bộ cho riêng màn hình Graph. */}
        {notice && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-8">
            <div className="max-w-sm rounded-xl border border-danger-500/40 bg-base-950 px-4 py-3 text-center text-sm font-medium text-danger-500 shadow-2xl">
              {notice}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Component Node = 1 component thật trên landing (chỉ icon + tên, xem ComponentNode.tsx). Signal
// Chip Node = 1 tín hiệu ĐÃ ĐƯỢC KÉO ra (kéo từ TriggerSidebar.tsx thả vào ĐÚNG Component Node hỗ
// trợ nó) — chưa chắc đã nối dây. Nối dây thật (kéo giữa 2 chấm của 2 chip) mới tạo ra 1
// TriggerAction. Ghi thẳng vào config thật qua onUpdateComponent/onUpdateTriggerGraph — Trigger
// Graph dùng chung 1 Save/Discard với cả Builder (xem LandingBuilderWindow.tsx), không có draft
// riêng của màn hình này.
export default function TriggerGraphEditor(props: TriggerGraphEditorProps) {
  return (
    <ReactFlowProvider>
      <TriggerGraphEditorInner {...props} />
    </ReactFlowProvider>
  );
}
