import {
  AnchorEditTarget,
  DEFAULT_FIREWORK_EFFECT,
  DEFAULT_PRIZE_GROUP_EFFECT,
  DEFAULT_PRIZE_STAGE_EFFECT,
  LiveImageProps,
  PrizeGroupEffect,
  PrizeStageKey,
} from "@/lib/landing/types";
import { Prize } from "@/types";
import PrizeEffectPicker from "./PrizeEffectPicker";

interface LiveImagePanelProps {
  props: LiveImageProps;
  prizes: Prize[];
  onChange: (patch: Partial<LiveImageProps>) => void;
  // ID của CHÍNH component đang sửa (LandingComponent.id) — cần để so khớp với `anchorEdit.componentId`
  // (đang sửa điểm neo Scale Up của component nào, đúng field nào — xem doc-comment AnchorEditTarget
  // trong types.ts) và để tự đặt target khi người dùng bấm nút bật ở ScaleAnchorTrigger.tsx.
  componentId: string;
  anchorEdit: AnchorEditTarget | null;
  onSetAnchorEdit: (target: AnchorEditTarget | null) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

// Ảnh trình chiếu giờ BẮT BUỘC phải nhập ở màn Prizes (xem PrizeFormModal.tsx) — panel này không còn
// picker "ảnh dự phòng" riêng nữa, Prize Image lấy THẲNG display_image của giải đã chọn.
//
// Cấu trúc Basic options/Interactions — cùng mẫu vừa dựng cho BackgroundPanel.tsx. "Interactions" chỉ
// gồm 4 giai đoạn USER tương tác với ĐÚNG instance này (Click/Select/Won/Out of Stock, xem
// PrizeEffectPicker.tsx) + 1 mục "Interact with Wheel" riêng (dimUnselectedAmount — dim giải NÀY khi
// 1 giải KHÁC đang được chọn/quay, KHÔNG liên quan gì tới remaining của chính giải này).
export default function LiveImagePanel({ props, prizes, onChange, componentId, anchorEdit, onSetAnchorEdit }: LiveImagePanelProps) {
  // Landing lưu TRƯỚC KHI có hệ 4-giai-đoạn này không có 4 field object dưới đây trong JSON đã lưu dù
  // TypeScript khai báo bắt buộc — PHẢI fallback, xem doc-comment DEFAULT_PRIZE_STAGE_EFFECT trong
  // types.ts (thiếu bước này crash trắng màn hình ngay khi mở panel của prize cũ — bug đã gặp thật).
  const onHover = props.onHover ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onSelect = props.onSelect ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onWon = props.onWon ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onOutOfStock = props.onOutOfStock ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onWonFirework = props.onWonFirework ?? DEFAULT_FIREWORK_EFFECT;

  // 3 callback cho ScaleAnchorTrigger.tsx/LiftDirectionTrigger.tsx (xem doc-comment ở đó cho ý nghĩa
  // từng nút) — chỉ 1 stage được canvas theo dõi cùng lúc (không cộng dồn, xem doc-comment
  // AnchorEditTarget trong types.ts).
  function anchorModeFor(stageKey: PrizeStageKey): "placing" | "editing" | "locked" | null {
    return anchorEdit?.componentId === componentId && anchorEdit?.stageKey === stageKey ? anchorEdit.mode : null;
  }
  // scaleUp: "Drop" (chưa có Anchor) hoặc "Edit" (đã có, tiếp tục kéo Direction) — Anchor CỐ ĐỊNH sau
  // khi đã thả 1 lần, nên bấm lại "Edit" luôn vào thẳng "editing", không quay lại "placing". lift
  // KHÔNG CÓ mode "placing" (điểm cố định LUÔN có sẵn, không cần thả — xem doc-comment
  // LiftDirectionTrigger.tsx) nên luôn vào thẳng "editing" bất kể đã cấu hình hay chưa.
  function startEditingAnchor(stageKey: PrizeStageKey, focus: PrizeGroupEffect) {
    const mode = focus.effect === "scaleUp" && !focus.anchorPlaced ? "placing" : "editing";
    onSetAnchorEdit({ componentId, stageKey, mode });
  }
  function doneAnchor(stageKey: PrizeStageKey) {
    onSetAnchorEdit({ componentId, stageKey, mode: "locked" });
  }
  function removeAnchor(stageKey: PrizeStageKey) {
    if (anchorEdit?.componentId === componentId && anchorEdit?.stageKey === stageKey) onSetAnchorEdit(null);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>

        <div>
          <label className={labelClass}>Prize</label>
          <select className={fieldClass} value={props.prizeId ?? ""} onChange={(e) => onChange({ prizeId: e.target.value })}>
            <option value="">— none selected —</option>
            {prizes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] leading-snug text-base-500">
            Always shows this exact prize, no matter what's being drawn — place several of these to
            match custom artwork, one per prize. Doesn't multiply with quantity — always exactly 1
            image.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Fit</label>
            <select
              className={fieldClass}
              value={props.fit}
              onChange={(e) => onChange({ fit: e.target.value as LiveImageProps["fit"] })}
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
      </div>

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Interactions</span>
        <p className="text-[10px] leading-snug text-base-500">
          Present Mode only: click this prize to select it for Draw — clicking it again, or picking a
          different prize, undoes that. Out-of-stock prizes can't be selected — clicking one just shows
          a popup instead. Each stage below can combine one Focus effect, one Highlight effect, and one
          Motion effect at the same time — only one per group.
        </p>

        <PrizeEffectPicker
          title="When Hover"
          description="Stays active while the mouse is hovering near it, before it's selected."
          value={onHover}
          onChange={(patch) => onChange({ onHover: { ...onHover, ...patch } })}
          anchorMode={anchorModeFor("onHover")}
          onStartEditingAnchor={() => startEditingAnchor("onHover", onHover.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onHover")}
          onRemoveAnchor={() => removeAnchor("onHover")}
        />
        <PrizeEffectPicker
          title="When Select"
          description="Stays active the whole time this prize is the selected one."
          value={onSelect}
          onChange={(patch) => onChange({ onSelect: { ...onSelect, ...patch } })}
          anchorMode={anchorModeFor("onSelect")}
          onStartEditingAnchor={() => startEditingAnchor("onSelect", onSelect.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onSelect")}
          onRemoveAnchor={() => removeAnchor("onSelect")}
        />
        <PrizeEffectPicker
          title="When Won"
          description="Plays once the instant the Wheel reveals this prize's winner — no need to hit Confirm first."
          value={onWon}
          onChange={(patch) => onChange({ onWon: { ...onWon, ...patch } })}
          anchorMode={anchorModeFor("onWon")}
          onStartEditingAnchor={() => startEditingAnchor("onWon", onWon.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onWon")}
          onRemoveAnchor={() => removeAnchor("onWon")}
        />

        <div className="space-y-3 rounded-lg border border-base-800 p-2.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-base-100">
            <input
              type="checkbox"
              checked={onWonFirework.enabled}
              onChange={(e) => onChange({ onWonFirework: { ...onWonFirework, enabled: e.target.checked } })}
              className="accent-gold-500"
            />
            When Won — Firework
          </label>
          {onWonFirework.enabled && (
            <>
              <p className="text-[10px] leading-snug text-base-500">
                Fires a full-screen celebration the instant this prize's winner is revealed — same
                moment as the effects above, but drawn over the whole screen instead of just this image.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Color 1</label>
                  <input
                    type="color"
                    className="h-[26px] w-full rounded border border-base-700 bg-base-800"
                    value={onWonFirework.color1}
                    onChange={(e) => onChange({ onWonFirework: { ...onWonFirework, color1: e.target.value } })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Color 2</label>
                  <input
                    type="color"
                    className="h-[26px] w-full rounded border border-base-700 bg-base-800"
                    value={onWonFirework.color2}
                    onChange={(e) => onChange({ onWonFirework: { ...onWonFirework, color2: e.target.value } })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Bursts</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className={fieldClass}
                    value={onWonFirework.burstCount}
                    onChange={(e) => onChange({ onWonFirework: { ...onWonFirework, burstCount: Number(e.target.value) } })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Duration (ms)</label>
                  <input
                    type="number"
                    min={200}
                    step={100}
                    className={fieldClass}
                    value={onWonFirework.durationMs}
                    onChange={(e) => onChange({ onWonFirework: { ...onWonFirework, durationMs: Number(e.target.value) } })}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-base-800 p-2.5">
          <span className="text-xs font-medium text-base-100">When Out of Stock</span>
          <div>
            <label className={labelClass}>Dim amount ({props.outOfStockDimAmount ?? 58}%)</label>
            <input
              type="range"
              min={0}
              max={100}
              className="w-full accent-gold-500"
              value={props.outOfStockDimAmount ?? 58}
              onChange={(e) => onChange({ outOfStockDimAmount: Number(e.target.value) })}
            />
            <p className="mt-1 text-[10px] leading-snug text-base-500">How dark it gets once remaining hits 0 or it's hidden.</p>
          </div>
          <PrizeEffectPicker
            title="Additional effect"
            description="Optional — stays active the whole time, layered on top of the dim above."
            value={onOutOfStock}
            onChange={(patch) => onChange({ onOutOfStock: { ...onOutOfStock, ...patch } })}
            anchorMode={anchorModeFor("onOutOfStock")}
            onStartEditingAnchor={() => startEditingAnchor("onOutOfStock", onOutOfStock.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
            onDoneAnchor={() => doneAnchor("onOutOfStock")}
            onRemoveAnchor={() => removeAnchor("onOutOfStock")}
          />
        </div>

        <div className="space-y-3 rounded-lg border border-base-800 p-2.5">
          <span className="text-xs font-medium text-base-100">Interact with Wheel</span>
          <div>
            <label className={labelClass}>Dim when not selected ({props.dimUnselectedAmount ?? 60}%)</label>
            <input
              type="range"
              min={0}
              max={100}
              className="w-full accent-gold-500"
              value={props.dimUnselectedAmount ?? 60}
              onChange={(e) => onChange({ dimUnselectedAmount: Number(e.target.value) })}
            />
            <p className="mt-1 text-[10px] leading-snug text-base-500">
              While the Wheel is spinning and a DIFFERENT prize is selected, this one dims down to make
              the selected prize stand out. 0 = no dimming.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
