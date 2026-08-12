import { useEffect, useState } from "react";
import { LandingConfig, TriggerAction } from "@/lib/landing/types";
import { COMPONENT_REGISTRY, COMPONENT_SIGNALS } from "../componentRegistry";

// MIME riêng cho kéo-thả 1 TÍN HIỆU (khác MIME kéo-thả component mới từ ComponentPalette.tsx) —
// mang theo { signal, role } dạng JSON, đọc lại ở TriggerGraphEditor.tsx lúc thả vào 1 Component Node.
export const SIGNAL_DRAG_MIME = "application/x-trigger-signal";

interface TriggerSidebarProps {
  config: LandingConfig;
  onChangeAction: (ownerId: string, actionId: string, patch: Partial<TriggerAction>) => void;
  onDeleteAction: (ownerId: string, actionId: string) => void;
}

interface LinkRow {
  ownerId: string;
  action: TriggerAction;
  sourceLabel: string;
  targetLabel: string;
}

interface SignalEntry {
  signal: string;
  role: "emit" | "listen";
}

interface ComponentSignalGroup {
  componentId: string;
  label: string;
  typeLabel: string;
  signals: SignalEntry[];
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

function componentLabelOf(config: LandingConfig, id: string): string {
  const c = config.components.find((c) => c.id === id);
  if (!c) return id;
  return c.name?.trim() || COMPONENT_REGISTRY[c.type].label;
}

function allLinks(config: LandingConfig): LinkRow[] {
  const rows: LinkRow[] = [];
  config.components.forEach((c) => {
    (c.triggerActions ?? []).forEach((action) => {
      rows.push({
        ownerId: c.id,
        action,
        sourceLabel: componentLabelOf(config, action.sourceComponentId),
        targetLabel: componentLabelOf(config, c.id),
      });
    });
  });
  return rows;
}

// Danh sách component THẬT SỰ đang có mặt trên trang (chỉ những loại có emits/listensFor) kèm tín
// hiệu CỦA RIÊNG NÓ — theo TỪNG INSTANCE, không khử trùng theo tên nữa (trước đây gộp chung 1 danh
// sách tín hiệu phẳng theo TÊN, khiến 2 Button khác nhau trên trang chỉ hiện chung 1 chip
// "Button.Click" — không rõ kéo cho Button nào, đặc biệt rối khi trang có nhiều Button/Receiver cùng
// loại). Tên tín hiệu vẫn dùng chung theo TYPE (không có tín hiệu ring riêng theo instance — bản chất
// hệ thống này không phân biệt), nhưng gom theo component giúp người dùng tìm đúng "cửa" cần kéo
// nhanh hơn hẳn so với dò cả cục danh sách phẳng.
function componentSignalGroups(config: LandingConfig): ComponentSignalGroup[] {
  return config.components
    .filter((c) => !!COMPONENT_SIGNALS[c.type])
    .map((c) => {
      const signals = COMPONENT_SIGNALS[c.type];
      const entries: SignalEntry[] = [
        ...(signals?.emits ?? []).map((s) => ({ signal: s, role: "emit" as const })),
        ...(signals?.listensFor ?? []).map((s) => ({ signal: s, role: "listen" as const })),
      ];
      return {
        componentId: c.id,
        label: c.name?.trim() || COMPONENT_REGISTRY[c.type].label,
        typeLabel: COMPONENT_REGISTRY[c.type].label,
        signals: entries,
      };
    });
}

// Sidebar trái, LUÔN hiện — 2 phần: (1) danh sách COMPONENT đang có trên trang, click 1 dòng mở
// flyout liệt kê tín hiệu CỦA RIÊNG NÓ để kéo-thả vào canvas (đặt ra 1 signal chip trên ĐÚNG
// component hỗ trợ nó, xem TriggerGraphEditor.tsx) — trước đây là 1 danh sách tín hiệu phẳng khử
// trùng theo TÊN, không rõ tín hiệu đó "thuộc về" component cụ thể nào khi trang có nhiều
// Emitter/Receiver cùng loại (vd 2 Button); gom theo component giải quyết đúng vấn đề đó. (2) danh
// sách link đã nối dây thật (kéo giữa 2 chip trên canvas) — click 1 dòng để sửa Delay/xoá. Tạo link
// KHÔNG còn form dropdown nữa — 100% qua kéo-thả + nối dây trên canvas.
export default function TriggerSidebar({ config, onChangeAction, onDeleteAction }: TriggerSidebarProps) {
  const links = allLinks(config);
  const groups = componentSignalGroups(config);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [openComponentId, setOpenComponentId] = useState<string | null>(null);

  // Đóng flyout khi click ra ngoài — cùng kiểu với flyout Add/Layers trong LandingBuilderWindow.tsx.
  useEffect(() => {
    if (!openComponentId) return;
    const close = () => setOpenComponentId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openComponentId]);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-base-800 bg-base-900">
      <div className="shrink-0 border-b border-base-800 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-base-300">Components</span>
        <p className="mt-1 text-[10px] leading-snug text-base-500">
          Click a component to see its signals, then drag one onto the matching node on canvas.
        </p>
      </div>

      <div className="shrink-0 space-y-1 border-b border-base-800 p-3">
        {groups.length === 0 ? (
          <p className="px-1 text-[11px] leading-snug text-base-500">
            No Emitter/Receiver component on this page yet.
          </p>
        ) : (
          groups.map((group) => {
            const isOpen = openComponentId === group.componentId;
            return (
              <div key={group.componentId} className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setOpenComponentId(isOpen ? null : group.componentId)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                    isOpen
                      ? "border-gold-500 bg-base-800 text-base-100"
                      : "border-base-700 bg-base-800/60 text-base-200 hover:border-gold-500/50"
                  }`}
                >
                  <span className="truncate">{group.label}</span>
                  <span className="shrink-0 text-[10px] text-base-500">{group.typeLabel}</span>
                </button>
                {isOpen && (
                  <div className="absolute left-full top-0 z-30 ml-2 w-52 rounded-xl border border-base-700 bg-base-900 p-2.5 shadow-2xl">
                    <div className="flex flex-wrap gap-1.5">
                      {group.signals.map(({ signal, role }) => (
                        <div
                          key={signal}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData(SIGNAL_DRAG_MIME, JSON.stringify({ signal, role }))}
                          title={
                            role === "emit"
                              ? "Emit signal — drag onto the component that sends it"
                              : "Listen signal — drag onto the component that receives it"
                          }
                          className={`cursor-grab select-none rounded-full border bg-base-800 px-3 py-1 text-[11px] font-medium active:cursor-grabbing ${
                            role === "emit" ? "border-teal-600 text-teal-600" : "border-gold-500 text-gold-500"
                          }`}
                        >
                          {signal}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-b border-base-800 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-base-300">Connections</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {links.length === 0 ? (
          <p className="px-1 text-[11px] leading-snug text-base-500">
            No links yet — drag 2 signal chips onto canvas, then draw a line between them.
          </p>
        ) : (
          <div className="space-y-1.5">
            {links.map(({ ownerId, action, sourceLabel, targetLabel }) => {
              const isExpanded = expandedActionId === action.id;
              const ownerType = config.components.find((c) => c.id === ownerId)?.type;
              const rowSignalOptions = (ownerType && COMPONENT_SIGNALS[ownerType]?.listensFor) || [];
              return (
                <div key={action.id} className="rounded border border-base-700 bg-base-800">
                  <button
                    onClick={() => setExpandedActionId(isExpanded ? null : action.id)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs text-base-100"
                  >
                    <span className="truncate">
                      {sourceLabel} → {targetLabel}
                    </span>
                    <span className="shrink-0 font-medium text-teal-500">{action.command}</span>
                  </button>
                  {isExpanded && (
                    <div className="space-y-2 border-t border-base-700 p-2.5">
                      <div>
                        <label className={labelClass}>Signal</label>
                        <select
                          className={fieldClass}
                          value={action.command}
                          onChange={(e) => onChangeAction(ownerId, action.id, { command: e.target.value })}
                        >
                          {rowSignalOptions.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Delay (ms)</label>
                        <input
                          type="number"
                          min={0}
                          className={fieldClass}
                          value={action.delayMs}
                          onChange={(e) => onChangeAction(ownerId, action.id, { delayMs: Math.max(0, Number(e.target.value)) })}
                        />
                      </div>
                      <button
                        onClick={() => {
                          setExpandedActionId(null);
                          onDeleteAction(ownerId, action.id);
                        }}
                        className="w-full rounded border border-danger-500/30 bg-danger-500/10 px-2 py-1 text-[11px] text-danger-500 hover:bg-danger-500/20"
                      >
                        Delete link
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
