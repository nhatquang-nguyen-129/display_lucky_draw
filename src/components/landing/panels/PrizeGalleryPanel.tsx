import {
  AnchorEditTarget,
  DEFAULT_PRIZE_GROUP_EFFECT,
  DEFAULT_PRIZE_STAGE_EFFECT,
  PrizeGalleryProps,
  PrizeGroupEffect,
  PrizeStageKey,
} from "@/lib/landing/types";
import PrizeEffectPicker from "./PrizeEffectPicker";

interface PrizeGalleryPanelProps {
  props: PrizeGalleryProps;
  onChange: (patch: Partial<PrizeGalleryProps>) => void;
  // Xem doc-comment cùng tên trong LiveImagePanel.tsx — cơ chế y hệt, chỉ khác component type đang sửa.
  componentId: string;
  anchorEdit: AnchorEditTarget | null;
  onSetAnchorEdit: (target: AnchorEditTarget | null) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

// Cấu trúc Basic options/Interactions — cùng mẫu BackgroundPanel.tsx/LiveImagePanel.tsx (xem
// doc-comment ở đó cho chi tiết đầy đủ về 4 giai đoạn When Click/Select/Won/Out of Stock + mục
// "Interact with Wheel" riêng cho dimUnselectedAmount).
export default function PrizeGalleryPanel({ props, onChange, componentId, anchorEdit, onSetAnchorEdit }: PrizeGalleryPanelProps) {
  // Landing lưu TRƯỚC KHI có hệ 4-giai-đoạn này không có 4 field object dưới đây trong JSON đã lưu dù
  // TypeScript khai báo bắt buộc — PHẢI fallback, xem doc-comment DEFAULT_PRIZE_STAGE_EFFECT trong
  // types.ts (thiếu bước này crash trắng màn hình ngay khi mở panel của prize cũ — bug đã gặp thật).
  const onHover = props.onHover ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onSelect = props.onSelect ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onWon = props.onWon ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onOutOfStock = props.onOutOfStock ?? DEFAULT_PRIZE_STAGE_EFFECT;

  // Xem doc-comment anchorModeFor/startEditingAnchor/doneAnchor/removeAnchor cùng tên trong
  // LiveImagePanel.tsx — cơ chế y hệt.
  function anchorModeFor(stageKey: PrizeStageKey): "placing" | "editing" | "locked" | null {
    return anchorEdit?.componentId === componentId && anchorEdit?.stageKey === stageKey ? anchorEdit.mode : null;
  }
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

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Columns</label>
            <input
              type="number"
              min={1}
              className={fieldClass}
              value={props.columns}
              onChange={(e) => onChange({ columns: Math.max(1, Number(e.target.value)) })}
            />
          </div>
          <div>
            <label className={labelClass}>Gap</label>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={props.gap}
              onChange={(e) => onChange({ gap: Math.max(0, Number(e.target.value)) })}
            />
          </div>
          <div>
            <label className={labelClass}>Image fit</label>
            <select
              className={fieldClass}
              value={props.imageFit}
              onChange={(e) => onChange({ imageFit: e.target.value as PrizeGalleryProps["imageFit"] })}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Corner radius</label>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={props.borderRadius}
              onChange={(e) => onChange({ borderRadius: Number(e.target.value) })}
            />
          </div>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-base-200">
          <input
            type="checkbox"
            checked={props.showName}
            onChange={(e) => onChange({ showName: e.target.checked })}
            className="accent-gold-500"
          />
          Show prize name
        </label>

        {props.showName && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Name font size</label>
              <input
                type="number"
                className={fieldClass}
                value={props.nameFontSize}
                onChange={(e) => onChange({ nameFontSize: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>Name color</label>
              <input
                type="color"
                className="h-[26px] w-full rounded border border-base-700 bg-base-800"
                value={props.nameColor}
                onChange={(e) => onChange({ nameColor: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Interactions</span>
        <p className="text-[10px] leading-snug text-base-500">
          Present Mode only: click a prize to select it for Draw — clicking it again, or picking a
          different prize, undoes that. The next Draw picks a winner for that prize specifically.
          Out-of-stock prizes can't be selected — clicking one just shows a popup instead. Each stage
          below can combine one Focus effect, one Highlight effect, and one Motion effect at the same
          time — only one per group.
        </p>

        <PrizeEffectPicker
          title="When Hover"
          description="Stays active while the mouse is hovering near a prize, before it's selected."
          value={onHover}
          onChange={(patch) => onChange({ onHover: { ...onHover, ...patch } })}
          anchorMode={anchorModeFor("onHover")}
          onStartEditingAnchor={() => startEditingAnchor("onHover", onHover.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onHover")}
          onRemoveAnchor={() => removeAnchor("onHover")}
        />
        <PrizeEffectPicker
          title="When Select"
          description="Stays active the whole time a prize is the selected one."
          value={onSelect}
          onChange={(patch) => onChange({ onSelect: { ...onSelect, ...patch } })}
          anchorMode={anchorModeFor("onSelect")}
          onStartEditingAnchor={() => startEditingAnchor("onSelect", onSelect.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onSelect")}
          onRemoveAnchor={() => removeAnchor("onSelect")}
        />
        <PrizeEffectPicker
          title="When Won"
          description="Plays once the instant the Wheel reveals a prize's winner — no need to hit Confirm first."
          value={onWon}
          onChange={(patch) => onChange({ onWon: { ...onWon, ...patch } })}
          anchorMode={anchorModeFor("onWon")}
          onStartEditingAnchor={() => startEditingAnchor("onWon", onWon.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onWon")}
          onRemoveAnchor={() => removeAnchor("onWon")}
        />

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
              While the Wheel is spinning, every prize EXCEPT the selected one dims down to make it
              stand out. 0 = no dimming.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
