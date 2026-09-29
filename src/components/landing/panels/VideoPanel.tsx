import { useContext, useState } from "react";
import {
  DEFAULT_VIDEO_CYCLE,
  VideoCycleConfig,
  VideoPhaseAction,
  VideoPlayState,
  VideoProps,
} from "@/lib/landing/types";
import { useLandingSessionId } from "../LandingSessionContext";
import { DrawCyclePrizesContext } from "./DrawCycleFields";

interface VideoPanelProps {
  props: VideoProps;
  onChange: (patch: Partial<VideoProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";
const detailsClass = "rounded-lg border border-base-800";
const summaryClass = "flex cursor-pointer select-none items-center justify-between px-2.5 py-2 text-xs font-medium text-base-100";
const detailsBodyClass = "space-y-2 border-t border-base-800 px-2.5 pb-2.5 pt-2.5";
const arrowLabelClass = "text-[10px] font-normal normal-case text-base-500";

const STATES: VideoPlayState[] = ["play", "pause", "stop"];
const STATE_LABEL: Record<VideoPlayState, string> = { play: "Play", pause: "Pause", stop: "Stop" };

function actionLabel(action: VideoPhaseAction): string {
  return action === "none" ? "None" : STATE_LABEL[action];
}

// Cùng quy tắc với DrawCycleFields.tsx: 1 mốc không được TRÙNG giá trị thật gần nhất phía trước nó.
function forbiddenState(cycle: VideoCycleConfig, phase: "draw" | "redraw"): VideoPlayState {
  if (phase === "draw") return cycle.idleState;
  return cycle.drawAction !== "none" ? cycle.drawAction : cycle.idleState;
}

function delayField(value: number | undefined, onChange: (delayMs: number | undefined) => void) {
  return (
    <div>
      <label className={labelClass}>Delay (ms)</label>
      <input
        type="number"
        min={0}
        step={100}
        placeholder="0"
        className={fieldClass}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))}
      />
    </div>
  );
}

// Basic options giống ImagePanel.tsx (+ Loop/Muted). "Interactions with Draw" cùng bố cục
// DrawCycleFields.tsx (Prize + 3 mốc Idle/Draw/Redraw) nhưng Appearance là Play/Pause/Stop và không có
// Effect (đổi trạng thái phát là tức thì) — không dùng lại DrawCycleFields vì domain/field khác hẳn.
export default function VideoPanel({ props, onChange }: VideoPanelProps) {
  const sessionId = useLandingSessionId();
  const prizes = useContext(DrawCyclePrizesContext);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPhase, setOpenPhase] = useState<Record<string, boolean>>({ idle: true, draw: true, redraw: true });

  async function handleImport() {
    if (!sessionId) return;
    setImporting(true);
    setError(null);
    try {
      const result = await window.api.media.importVideo(sessionId);
      if (!result) return;
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onChange({ mediaId: result.mediaId, fileName: result.fileName });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  const cycle = props.drawCycle ?? DEFAULT_VIDEO_CYCLE;

  function updateCycle(patch: Partial<VideoCycleConfig>) {
    onChange({ drawCycle: { ...cycle, ...patch } });
  }

  function toggleSync(enabled: boolean) {
    if (enabled && !props.drawCycle) {
      onChange({ syncWithDraw: true, drawCycle: DEFAULT_VIDEO_CYCLE });
    } else {
      onChange({ syncWithDraw: enabled });
    }
  }

  // Đổi Idle → Draw/Redraw đang lưu mà thành TRÙNG mốc trước nó thì về "none" để người dùng tự chọn lại
  // (3 giá trị nên luôn còn ≥ 2 lựa chọn hợp lệ, không đoán bừa — giống domain rộng ở DrawCycleFields).
  function setIdleState(state: VideoPlayState) {
    const patch: Partial<VideoCycleConfig> = { idleState: state };
    if (cycle.drawAction === state) patch.drawAction = "none";
    const effectiveDraw = patch.drawAction ?? cycle.drawAction;
    const redrawForbidden = effectiveDraw !== "none" ? effectiveDraw : state;
    if (cycle.redrawAction === redrawForbidden) patch.redrawAction = "none";
    updateCycle(patch);
  }

  function setDrawAction(action: VideoPhaseAction) {
    const patch: Partial<VideoCycleConfig> = { drawAction: action };
    const redrawForbidden = action !== "none" ? action : cycle.idleState;
    if (cycle.redrawAction === redrawForbidden) patch.redrawAction = "none";
    updateCycle(patch);
  }

  function toggle(open: boolean, key: string) {
    setOpenPhase((s) => ({ ...s, [key]: open }));
  }

  const drawForbidden = forbiddenState(cycle, "draw");
  const redrawForbidden = forbiddenState(cycle, "redraw");
  const prizeMissing = !!cycle.prizeId && !prizes.some((p) => p.id === cycle.prizeId);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>
        <div>
          <label className={labelClass}>Video (MP4, WebM, MOV)</label>
          {props.fileName && <p className="mb-1 truncate text-xs text-base-200" title={props.fileName}>{props.fileName}</p>}
          <button
            onClick={handleImport}
            disabled={importing || !sessionId}
            className="rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 hover:border-gold-500 disabled:opacity-50"
          >
            {importing ? "Importing…" : props.mediaId ? "Replace video…" : "Choose video…"}
          </button>
          {props.mediaId && (
            <button
              onClick={() => onChange({ mediaId: null, fileName: null })}
              className="ml-3 text-left text-[11px] text-danger-500 hover:underline"
            >
              Remove video
            </button>
          )}
          {error && <p className="mt-1 text-[11px] text-danger-500">{error}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Fit</label>
            <select
              className={fieldClass}
              value={props.fit}
              onChange={(e) => onChange({ fit: e.target.value as VideoProps["fit"] })}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Border radius</label>
            <input
              type="number"
              className={fieldClass}
              value={props.borderRadius}
              onChange={(e) => onChange({ borderRadius: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-base-200">
            <input
              type="checkbox"
              checked={props.loop}
              onChange={(e) => onChange({ loop: e.target.checked })}
              className="accent-gold-500"
            />
            Loop
          </label>
          <label className="flex items-center gap-1.5 text-xs text-base-200">
            <input
              type="checkbox"
              checked={props.muted}
              onChange={(e) => onChange({ muted: e.target.checked })}
              className="accent-gold-500"
            />
            Muted
          </label>
        </div>
      </div>

      <div className="h-px bg-base-800" />

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
        {!props.syncWithDraw && <p className="text-[11px] text-base-500">Video plays automatically in Presentation.</p>}

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
                    {p.category?.trim() ? `${p.category.trim()} - ${p.name}` : p.name}
                  </option>
                ))}
                {prizeMissing && <option value={cycle.prizeId}>(Deleted prize)</option>}
              </select>
            </div>

            <details open={openPhase.idle} onToggle={(e) => toggle(e.currentTarget.open, "idle")} className={detailsClass}>
              <summary className={summaryClass}>
                Idle
                <span className={arrowLabelClass}>on open/Reset → {actionLabel(cycle.idleState)}</span>
              </summary>
              <div className={detailsBodyClass}>
                <div>
                  <label className={labelClass}>Appearance</label>
                  <select
                    className={fieldClass}
                    value={cycle.idleState}
                    onChange={(e) => setIdleState(e.target.value as VideoPlayState)}
                  >
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {STATE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                {delayField(cycle.idleDelayMs, (idleDelayMs) => updateCycle({ idleDelayMs }))}
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
                    onChange={(e) => setDrawAction(e.target.value as VideoPhaseAction)}
                  >
                    <option value="none">None</option>
                    {STATES.map((s) => (
                      <option key={s} value={s} disabled={s === drawForbidden}>
                        {STATE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                {cycle.drawAction !== "none" && delayField(cycle.drawDelayMs, (drawDelayMs) => updateCycle({ drawDelayMs }))}
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
                    onChange={(e) => updateCycle({ redrawAction: e.target.value as VideoPhaseAction })}
                  >
                    <option value="none">None</option>
                    {STATES.map((s) => (
                      <option key={s} value={s} disabled={s === redrawForbidden}>
                        {STATE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                {cycle.redrawAction !== "none" &&
                  delayField(cycle.redrawDelayMs, (redrawDelayMs) => updateCycle({ redrawDelayMs }))}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
