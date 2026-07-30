import { useEffect, useState } from "react";
import { LandingConfig, TriggerAction } from "@/lib/landing/types";
import { COMPONENT_REGISTRY, COMPONENT_SIGNALS } from "../componentRegistry";

interface Option {
  id: string;
  label: string;
}

interface TriggerSidebarProps {
  config: LandingConfig;
  targetOptions: Option[];
  sourceOptions: Option[];
  selectedActionId: string | null;
  prefillTargetId?: string;
  onSelectAction: (actionId: string | null) => void;
  onCreate: (targetComponentId: string, patch: { sourceComponentId: string; command: string; delayMs: number }) => void;
  onChangeAction: (ownerId: string, actionId: string, patch: Partial<TriggerAction>) => void;
  onDeleteAction: (ownerId: string, actionId: string) => void;
}

interface LinkRow {
  ownerId: string;
  action: TriggerAction;
  sourceLabel: string;
  targetLabel: string;
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

// Sidebar trái, LUÔN hiện (không phụ thuộc đã chọn node nào trên canvas) — liệt kê MỌI trigger link
// đang có trên trang + form "Add trigger" luôn sẵn sàng, thay hẳn panel dưới đáy trước đây chỉ hiện
// khi đã chọn 1 node đích. Đây là lối "chèn trigger action" chính, không cần đụng tới canvas.
export default function TriggerSidebar({
  config,
  targetOptions,
  sourceOptions,
  selectedActionId,
  prefillTargetId,
  onSelectAction,
  onCreate,
  onChangeAction,
  onDeleteAction,
}: TriggerSidebarProps) {
  const links = allLinks(config);
  const [targetComponentId, setTargetComponentId] = useState(prefillTargetId ?? targetOptions[0]?.id ?? "");
  const [sourceComponentId, setSourceComponentId] = useState(sourceOptions[0]?.id ?? "");
  const [delayMs, setDelayMs] = useState(0);
  const targetType = config.components.find((c) => c.id === targetComponentId)?.type;
  const signalOptions = (targetType && COMPONENT_SIGNALS[targetType]?.listensFor) || [];
  const [command, setCommand] = useState(signalOptions[0] ?? "");

  // Chọn 1 target ComponentNode trên canvas → điền sẵn Target trong form Add (tiện, không bắt buộc).
  useEffect(() => {
    if (prefillTargetId) setTargetComponentId(prefillTargetId);
  }, [prefillTargetId]);

  // Target/Source trỏ tới component đã bị xoá (hoặc rỗng lúc mới mở) → tự chọn lại lựa chọn đầu
  // tiên còn hợp lệ, tránh form kẹt ở 1 giá trị không còn tồn tại.
  useEffect(() => {
    if (targetOptions.length > 0 && !targetOptions.some((o) => o.id === targetComponentId)) {
      setTargetComponentId(targetOptions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOptions]);
  useEffect(() => {
    if (sourceOptions.length > 0 && !sourceOptions.some((o) => o.id === sourceComponentId)) {
      setSourceComponentId(sourceOptions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceOptions]);

  // Đổi Target → đổi hẳn bộ Signal hợp lệ, reset về lựa chọn đầu tiên của target MỚI (tránh giữ lại
  // 1 signal của target cũ không còn hợp lệ với target mới).
  useEffect(() => {
    setCommand(signalOptions[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetComponentId]);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-base-800 bg-base-900">
      <div className="shrink-0 border-b border-base-800 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-base-300">Trigger Links</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {links.length === 0 ? (
          <p className="px-1 text-[11px] leading-snug text-base-500">No links yet — wire one below.</p>
        ) : (
          <div className="space-y-1.5">
            {links.map(({ ownerId, action, sourceLabel, targetLabel }) => {
              const isSelected = selectedActionId === action.id;
              const ownerType = config.components.find((c) => c.id === ownerId)?.type;
              const rowSignalOptions = (ownerType && COMPONENT_SIGNALS[ownerType]?.listensFor) || [];
              return (
                <div key={action.id} className="rounded border border-base-700 bg-base-800">
                  <button
                    onClick={() => onSelectAction(isSelected ? null : action.id)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs text-base-100"
                  >
                    <span className="truncate">
                      {sourceLabel} → {targetLabel}
                    </span>
                    <span className="shrink-0 font-medium text-teal-500">{action.command}</span>
                  </button>
                  {isSelected && (
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
                        onClick={() => onDeleteAction(ownerId, action.id)}
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

      <div className="shrink-0 space-y-2 border-t border-base-800 p-3">
        <span className="text-[10px] uppercase tracking-wide text-base-500">Add trigger</span>
        {targetOptions.length === 0 || sourceOptions.length === 0 ? (
          <p className="text-[10px] leading-snug text-base-500">
            Need at least 1 Button (source) and 1 Lucky Wheel/Fireworks/Stage Light (target) on this
            page first.
          </p>
        ) : (
          <>
            <div>
              <label className={labelClass}>Target</label>
              <select className={fieldClass} value={targetComponentId} onChange={(e) => setTargetComponentId(e.target.value)}>
                {targetOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Source</label>
              <select className={fieldClass} value={sourceComponentId} onChange={(e) => setSourceComponentId(e.target.value)}>
                {sourceOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Signal</label>
              <select className={fieldClass} value={command} onChange={(e) => setCommand(e.target.value)}>
                {signalOptions.map((o) => (
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
                value={delayMs}
                onChange={(e) => setDelayMs(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <button
              onClick={() => onCreate(targetComponentId, { sourceComponentId, command, delayMs })}
              className="w-full rounded bg-gold-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-gold-400"
            >
              + Add trigger
            </button>
          </>
        )}
      </div>
    </div>
  );
}
