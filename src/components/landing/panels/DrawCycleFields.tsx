import { useState } from "react";
import {
  DrawCycleConfig,
  DrawPhaseAction,
  DrawPhaseEffectConfig,
  DrawRestState,
  WINNER_TRANSITION_EFFECTS,
  WinnerTransitionEffect,
} from "@/lib/landing/types";

// Field shape dùng chung bởi ImageProps/TextProps cho tính năng "Interactions with Draw" — component
// nào có ĐÚNG 2 field này (đều optional) thì dùng được component này, không cần khai báo interface
// riêng cho từng loại.
export interface DrawCycleHostProps {
  syncWithDraw?: boolean;
  drawCycle?: DrawCycleConfig;
}

interface DrawCycleFieldsProps {
  props: DrawCycleHostProps;
  onChange: (patch: Partial<DrawCycleHostProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";
const detailsClass = "rounded-lg border border-base-800";
const summaryClass = "flex cursor-pointer select-none items-center justify-between px-2.5 py-2 text-xs font-medium text-base-100";
const detailsBodyClass = "space-y-2 border-t border-base-800 px-2.5 pb-2.5 pt-2.5";
const arrowLabelClass = "text-[10px] font-normal normal-case text-base-500";

function opposite(state: DrawRestState): DrawRestState {
  return state === "appear" ? "disappear" : "appear";
}

function actionLabel(action: DrawPhaseAction): string {
  return action === "none" ? "None" : action === "appear" ? "Appear" : "Disappear";
}

// Bật "Trigger with Draw" lần đầu (chưa cấu hình gì) → nạp sẵn 1 bộ mặc định hợp lý (ẩn lúc Idle,
// hiện lúc Draw, ẩn rồi hiện lại lúc Redraw).
const DEFAULT_DRAW_CYCLE_ON: DrawCycleConfig = {
  idleState: "disappear",
  drawAction: "appear",
  drawEffect: { effect: "crossfade" },
  redrawAction: "disappear",
  redrawEffect: { effect: "crossfade" },
};

function effectFields(
  value: DrawPhaseEffectConfig | undefined,
  onChange: (patch: Partial<DrawPhaseEffectConfig>) => void
) {
  const config = value ?? { effect: "crossfade" as WinnerTransitionEffect };
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelClass}>Effect</label>
        <select
          className={fieldClass}
          value={config.effect}
          onChange={(e) => onChange({ effect: e.target.value as WinnerTransitionEffect })}
        >
          {WINNER_TRANSITION_EFFECTS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Delay (ms)</label>
        <input
          type="number"
          min={0}
          step={100}
          placeholder="0"
          className={fieldClass}
          value={config.delayMs ?? ""}
          onChange={(e) =>
            onChange({ delayMs: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })
          }
        />
      </div>
    </div>
  );
}

// Khối "Interactions with Draw" DÙNG CHUNG bởi ImagePanel.tsx/TextPanel.tsx — cả 2 component đều
// hiện 1 thứ TĨNH do người dùng tự đặt (ảnh/chuỗi chữ), không đổi theo từng lượt quay, nên hợp với
// model chung Idle/Draw/Redraw x Appearance (xem doc-comment DrawCycleConfig trong types.ts). Winner
// Name KHÔNG dùng component này (LiveTextPanel.tsx) vì nội dung của nó (tên người trúng) THẬT SỰ đổi
// theo từng lượt, dùng cơ chế `useRevealed` riêng — xem drawRevealHooks.ts.
export default function DrawCycleFields({ props, onChange }: DrawCycleFieldsProps) {
  const [openPhase, setOpenPhase] = useState<Record<string, boolean>>({ idle: true, draw: true, redraw: true });

  function toggleSync(enabled: boolean) {
    if (enabled && !props.drawCycle) {
      onChange({ syncWithDraw: true, drawCycle: DEFAULT_DRAW_CYCLE_ON });
    } else {
      onChange({ syncWithDraw: enabled });
    }
  }

  const cycle = props.drawCycle ?? DEFAULT_DRAW_CYCLE_ON;

  function updateCycle(patch: Partial<DrawCycleConfig>) {
    onChange({ drawCycle: { ...cycle, ...patch } });
  }

  // Đổi Idle → tự sửa lại Draw/Redraw nếu giá trị đang lưu KHÔNG còn hợp lệ với Idle mới (không được
  // để lại 1 cặp mốc liền kề TRÙNG trạng thái nhau trong dữ liệu đã lưu).
  function setIdleState(state: DrawRestState) {
    const flipped = opposite(state);
    const patch: Partial<DrawCycleConfig> = { idleState: state };
    if (cycle.drawAction !== "none" && cycle.drawAction !== flipped) patch.drawAction = flipped;
    if (cycle.redrawAction !== "none" && cycle.redrawAction !== state) patch.redrawAction = state;
    updateCycle(patch);
  }

  function toggle(open: boolean, key: string) {
    setOpenPhase((s) => ({ ...s, [key]: open }));
  }

  const drawInvalid = cycle.idleState; // giá trị Draw KHÔNG được chọn (trùng Idle)
  const redrawInvalid = opposite(cycle.idleState); // giá trị Redraw KHÔNG được chọn (đối lập Idle)

  return (
    <div className="space-y-2">
      <span className={groupLabelClass}>Interactions with Draw</span>
      <label className="flex items-center gap-1.5 text-xs text-base-200">
        <input
          type="checkbox"
          checked={!!props.syncWithDraw}
          onChange={(e) => toggleSync(e.target.checked)}
          className="accent-gold-500"
        />
        Trigger with Draw
      </label>

      {props.syncWithDraw && (
        <>
          <details open={openPhase.idle} onToggle={(e) => toggle(e.currentTarget.open, "idle")} className={detailsClass}>
            <summary className={summaryClass}>
              Idle
              <span className={arrowLabelClass}>on Reset → {actionLabel(cycle.idleState)}</span>
            </summary>
            <div className={detailsBodyClass}>
              <div>
                <label className={labelClass}>Appearance</label>
                <select
                  className={fieldClass}
                  value={cycle.idleState}
                  onChange={(e) => setIdleState(e.target.value as DrawRestState)}
                >
                  <option value="appear">Appear</option>
                  <option value="disappear">Disappear</option>
                </select>
              </div>
              {effectFields(cycle.idleEffect, (patch) =>
                updateCycle({ idleEffect: { ...(cycle.idleEffect ?? { effect: "crossfade" }), ...patch } })
              )}
            </div>
          </details>

          <details open={openPhase.draw} onToggle={(e) => toggle(e.currentTarget.open, "draw")} className={detailsClass}>
            <summary className={summaryClass}>
              Draw
              <span className={arrowLabelClass}>→ {actionLabel(cycle.drawAction)}</span>
            </summary>
            <div className={detailsBodyClass}>
              <div>
                <label className={labelClass}>Appearance</label>
                <select
                  className={fieldClass}
                  value={cycle.drawAction}
                  onChange={(e) => updateCycle({ drawAction: e.target.value as DrawPhaseAction })}
                >
                  <option value="none">None</option>
                  <option value="appear" disabled={drawInvalid === "appear"}>
                    Appear
                  </option>
                  <option value="disappear" disabled={drawInvalid === "disappear"}>
                    Disappear
                  </option>
                </select>
              </div>
              {cycle.drawAction !== "none" &&
                effectFields(cycle.drawEffect, (patch) =>
                  updateCycle({ drawEffect: { ...(cycle.drawEffect ?? { effect: "crossfade" }), ...patch } })
                )}
            </div>
          </details>

          <details open={openPhase.redraw} onToggle={(e) => toggle(e.currentTarget.open, "redraw")} className={detailsClass}>
            <summary className={summaryClass}>
              Redraw
              <span className={arrowLabelClass}>→ {actionLabel(cycle.redrawAction)}</span>
            </summary>
            <div className={detailsBodyClass}>
              <div>
                <label className={labelClass}>Appearance</label>
                <select
                  className={fieldClass}
                  value={cycle.redrawAction}
                  onChange={(e) => updateCycle({ redrawAction: e.target.value as DrawPhaseAction })}
                >
                  <option value="none">None</option>
                  <option value="appear" disabled={redrawInvalid === "appear"}>
                    Appear
                  </option>
                  <option value="disappear" disabled={redrawInvalid === "disappear"}>
                    Disappear
                  </option>
                </select>
              </div>
              {cycle.redrawAction !== "none" && (
                <>
                  {effectFields(cycle.redrawEffect, (patch) =>
                    updateCycle({ redrawEffect: { ...(cycle.redrawEffect ?? { effect: "crossfade" }), ...patch } })
                  )}
                  {cycle.drawAction !== "none" && (
                    <p className="text-[10px] text-base-500">
                      Then reveals the new result using the same effect as Draw above.
                    </p>
                  )}
                </>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
