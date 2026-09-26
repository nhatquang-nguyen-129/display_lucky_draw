import { createContext, useContext, useState } from "react";
import { Prize } from "@/types";
import {
  DrawCycleConfig,
  DrawPhaseAction,
  DrawPhaseEffectConfig,
  DrawRestState,
  WINNER_TRANSITION_EFFECTS,
  WinnerTransitionEffect,
} from "@/lib/landing/types";

// Field shape dùng chung bởi ImageProps/TextProps/BackgroundProps/OrbitLightsProps/FireworksProps/ConfettiProps/MarqueeLightsProps/SparkFountainProps cho tính năng "Interactions with
// Draw" — component nào có ĐÚNG 2 field này (đều optional) thì dùng được component này, không cần
// khai báo interface riêng cho từng loại.
export interface DrawCycleHostProps {
  syncWithDraw?: boolean;
  drawCycle?: DrawCycleConfig;
}

// Danh sách prize của session cho dropdown "Prize" — PropertiesPanel.tsx cung cấp 1 lần qua context
// thay vì luồn prop qua cả 7 panel dùng DrawCycleFields (Text/Image/Background/4 Effects).
export const DrawCyclePrizesContext = createContext<Prize[]>([]);

interface DrawCycleFieldsProps {
  props: DrawCycleHostProps;
  onChange: (patch: Partial<DrawCycleHostProps>) => void;
  // 4 giá trị Appearance (xem doc-comment DrawRestState trong types.ts) đều DÙNG CHUNG được ở tầng
  // type, nhưng KHÔNG PHẢI component nào cũng cho chọn cả 4 — Text bỏ trống (mặc định 2 giá trị đầu,
  // đúng y hệt bản trước khi generic hoá component này), Background/Image truyền đủ cả 4. Đây là CHỖ DUY NHẤT khai báo "domain" — mọi logic validate/label bên dưới tự đọc từ đây,
  // không hardcode 2 giá trị nữa.
  allowedStates?: DrawRestState[];
  // Bộ mặc định nạp lúc bật "Trigger with Draw" lần đầu — mỗi component có 1 bộ hợp lý riêng (Image/
  // Text: ẩn lúc Idle, hiện lúc Draw; Background: xem BackgroundPanel.tsx).
  defaultCycleOn?: DrawCycleConfig;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";
const detailsClass = "rounded-lg border border-base-800";
const summaryClass = "flex cursor-pointer select-none items-center justify-between px-2.5 py-2 text-xs font-medium text-base-100";
const detailsBodyClass = "space-y-2 border-t border-base-800 px-2.5 pb-2.5 pt-2.5";
const arrowLabelClass = "text-[10px] font-normal normal-case text-base-500";

const STATE_LABEL: Record<DrawRestState, string> = { appear: "Appear", disappear: "Disappear", dim: "Dim", blur: "Blur" };
const DEFAULT_ALLOWED_STATES: DrawRestState[] = ["appear", "disappear"];
const DEFAULT_AMOUNT: Record<"dim" | "blur", number> = { dim: 80, blur: 16 };

function actionLabel(action: DrawPhaseAction): string {
  return action === "none" ? "None" : STATE_LABEL[action];
}

// Giá trị KHÔNG được chọn cho phase `phase` — quy tắc CHUNG: 1 phase không được TRÙNG giá trị thật
// (khác "none") gần nhất phía TRƯỚC nó trong chuỗi Idle→Draw→Redraw (xem doc-comment DrawPhaseAction
// trong types.ts). Draw so với Idle; Redraw so với Draw NẾU Draw có giá trị thật, ngược lại so với
// Idle (Draw="none" coi như "bỏ qua", Redraw so sánh với mốc thật gần nhất trước đó là Idle).
function forbiddenState(cycle: DrawCycleConfig, phase: "draw" | "redraw"): DrawRestState {
  if (phase === "draw") return cycle.idleState;
  return cycle.drawAction !== "none" ? cycle.drawAction : cycle.idleState;
}

// Bật "Trigger with Draw" lần đầu (chưa cấu hình gì) → nạp sẵn 1 bộ mặc định hợp lý (ẩn lúc Idle,
// hiện lúc Draw, ẩn rồi hiện lại lúc Redraw). Dùng khi caller không tự truyền `defaultCycleOn` riêng.
const DEFAULT_DRAW_CYCLE_ON: DrawCycleConfig = {
  idleState: "disappear",
  drawAction: "appear",
  drawEffect: { effect: "crossfade" },
  redrawAction: "disappear",
  redrawEffect: { effect: "crossfade" },
};

function effectFields(
  value: DrawPhaseEffectConfig | undefined,
  targetState: DrawRestState,
  onChange: (patch: Partial<DrawPhaseEffectConfig>) => void
) {
  const config = value ?? { effect: "crossfade" as WinnerTransitionEffect };
  const showAmount = targetState === "dim" || targetState === "blur";
  const amount = config.amount ?? DEFAULT_AMOUNT[targetState === "blur" ? "blur" : "dim"];
  return (
    <>
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
      {showAmount &&
        (targetState === "dim" ? (
          <div>
            <label className={labelClass}>Dim amount ({amount}%)</label>
            <input
              type="range"
              min={0}
              max={100}
              className="w-full accent-gold-500"
              value={amount}
              onChange={(e) => onChange({ amount: Number(e.target.value) })}
            />
          </div>
        ) : (
          <div>
            <label className={labelClass}>Blur amount ({amount}px)</label>
            <input
              type="range"
              min={0}
              max={40}
              className="w-full accent-gold-500"
              value={amount}
              onChange={(e) => onChange({ amount: Number(e.target.value) })}
            />
          </div>
        ))}
    </>
  );
}

// Khối "Interactions with Draw" DÙNG CHUNG bởi ImagePanel.tsx/TextPanel.tsx/BackgroundPanel.tsx — cả
// 3 component đều hiện 1 thứ TĨNH do người dùng tự đặt (ảnh/chuỗi chữ/ảnh nền), không đổi theo từng
// lượt quay, nên hợp với model chung Idle/Draw/Redraw x Appearance (xem doc-comment DrawCycleConfig
// trong types.ts). Winner Name KHÔNG dùng component này (LiveTextPanel.tsx) vì nội dung của nó (tên
// người trúng) THẬT SỰ đổi theo từng lượt, dùng cơ chế `useRevealed` riêng — xem drawRevealHooks.ts.
export default function DrawCycleFields({ props, onChange, allowedStates, defaultCycleOn }: DrawCycleFieldsProps) {
  const [openPhase, setOpenPhase] = useState<Record<string, boolean>>({ idle: true, draw: true, redraw: true });
  const states = allowedStates ?? DEFAULT_ALLOWED_STATES;
  const defaultOn = defaultCycleOn ?? DEFAULT_DRAW_CYCLE_ON;

  function toggleSync(enabled: boolean) {
    if (enabled && !props.drawCycle) {
      onChange({ syncWithDraw: true, drawCycle: defaultOn });
    } else {
      onChange({ syncWithDraw: enabled });
    }
  }

  const cycle = props.drawCycle ?? defaultOn;

  function updateCycle(patch: Partial<DrawCycleConfig>) {
    onChange({ drawCycle: { ...cycle, ...patch } });
  }

  // Đổi Idle → tự sửa lại Draw/Redraw nếu giá trị đang lưu KHÔNG còn hợp lệ với Idle mới (không được
  // để lại 1 cặp mốc liền kề TRÙNG trạng thái nhau trong dữ liệu đã lưu). Domain 2 giá trị (Image/
  // Text) LUÔN còn đúng 1 lựa chọn hợp lệ duy nhất sau khi loại bỏ giá trị cấm — tự chọn thẳng luôn
  // (giữ NGUYÊN hành vi auto-flip cũ). Domain rộng hơn (Background) có thể còn NHIỀU lựa chọn hợp lệ —
  // không đoán bừa, reset về "none" để người dùng tự chọn lại.
  function setIdleState(state: DrawRestState) {
    const patch: Partial<DrawCycleConfig> = { idleState: state };
    const drawForbidden = state;
    if (cycle.drawAction !== "none" && cycle.drawAction === drawForbidden) {
      const remaining = states.filter((s) => s !== drawForbidden);
      patch.drawAction = remaining.length === 1 ? remaining[0] : "none";
    }
    const effectiveDraw = patch.drawAction ?? cycle.drawAction;
    const redrawForbidden = effectiveDraw !== "none" ? effectiveDraw : state;
    if (cycle.redrawAction !== "none" && cycle.redrawAction === redrawForbidden) {
      const remaining = states.filter((s) => s !== redrawForbidden);
      patch.redrawAction = remaining.length === 1 ? remaining[0] : "none";
    }
    updateCycle(patch);
  }

  function toggle(open: boolean, key: string) {
    setOpenPhase((s) => ({ ...s, [key]: open }));
  }

  const drawForbidden = forbiddenState(cycle, "draw");
  const redrawForbidden = forbiddenState(cycle, "redraw");
  const prizes = useContext(DrawCyclePrizesContext);
  const prizeMissing = !!cycle.prizeId && !prizes.some((p) => p.id === cycle.prizeId);

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
          <div>
            <label className={labelClass}>Prize</label>
            <select
              className={fieldClass}
              value={cycle.prizeId ?? ""}
              onChange={(e) => updateCycle({ prizeId: e.target.value || undefined })}
            >
              <option value="">Any prize</option>
              {prizes.map((p) => (
                <option key={p.id} value={p.id}>
                  {/* "Category - Name" — 2 giải cùng tên ở 2 hạng khác nhau vẫn phân biệt được; chưa có
                      category thì chỉ hiện tên. */}
                  {p.category?.trim() ? `${p.category.trim()} - ${p.name}` : p.name}
                </option>
              ))}
              {prizeMissing && <option value={cycle.prizeId}>(Deleted prize)</option>}
            </select>
          </div>

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
                  {states.map((s) => (
                    <option key={s} value={s}>
                      {STATE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              {effectFields(cycle.idleEffect, cycle.idleState, (patch) =>
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
                  {states.map((s) => (
                    <option key={s} value={s} disabled={s === drawForbidden}>
                      {STATE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              {cycle.drawAction !== "none" &&
                effectFields(cycle.drawEffect, cycle.drawAction, (patch) =>
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
                  {states.map((s) => (
                    <option key={s} value={s} disabled={s === redrawForbidden}>
                      {STATE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              {cycle.redrawAction !== "none" &&
                effectFields(cycle.redrawEffect, cycle.redrawAction, (patch) =>
                  updateCycle({ redrawEffect: { ...(cycle.redrawEffect ?? { effect: "crossfade" }), ...patch } })
                )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
