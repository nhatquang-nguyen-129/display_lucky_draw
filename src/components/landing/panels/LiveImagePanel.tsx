import {
  AnchorEditTarget,
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
// Cấu trúc Basic options/Self Interactions — cùng mẫu vừa dựng cho BackgroundPanel.tsx. "Self
// Interactions" đúng 2 cấp (không lồng thêm submenu): 4 mục When Hover/Select/Won/Out of Stock, mỗi
// mục 1 <details> riêng (xem PrizeEffectPicker.tsx) — "When Out of Stock" gộp CẢ thanh Dim amount VÀO
// CÙNG 1 <details> đó qua prop `children` của PrizeEffectPicker, không lồng thêm 1 <details> con nào
// nữa. Đã bỏ hẳn mục "Interact with Wheel" (dimUnselectedAmount) — không còn ai dùng.
export default function LiveImagePanel({ props, prizes, onChange, componentId, anchorEdit, onSetAnchorEdit }: LiveImagePanelProps) {
  // Landing lưu TRƯỚC KHI có hệ 4-giai-đoạn này không có 4 field object dưới đây trong JSON đã lưu dù
  // TypeScript khai báo bắt buộc — PHẢI fallback, xem doc-comment DEFAULT_PRIZE_STAGE_EFFECT trong
  // types.ts (thiếu bước này crash trắng màn hình ngay khi mở panel của prize cũ — bug đã gặp thật).
  const onHover = props.onHover ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onSelect = props.onSelect ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onWon = props.onWon ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const onOutOfStock = props.onOutOfStock ?? DEFAULT_PRIZE_STAGE_EFFECT;

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
        <span className={groupLabelClass}>Self Interactions</span>

        <PrizeEffectPicker
          title="When Hover"
          value={onHover}
          onChange={(patch) => onChange({ onHover: { ...onHover, ...patch } })}
          anchorMode={anchorModeFor("onHover")}
          onStartEditingAnchor={() => startEditingAnchor("onHover", onHover.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onHover")}
          onRemoveAnchor={() => removeAnchor("onHover")}
        />
        <PrizeEffectPicker
          title="When Select"
          value={onSelect}
          onChange={(patch) => onChange({ onSelect: { ...onSelect, ...patch } })}
          anchorMode={anchorModeFor("onSelect")}
          onStartEditingAnchor={() => startEditingAnchor("onSelect", onSelect.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onSelect")}
          onRemoveAnchor={() => removeAnchor("onSelect")}
        />
        <PrizeEffectPicker
          title="When Won"
          value={onWon}
          onChange={(patch) => onChange({ onWon: { ...onWon, ...patch } })}
          anchorMode={anchorModeFor("onWon")}
          onStartEditingAnchor={() => startEditingAnchor("onWon", onWon.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onWon")}
          onRemoveAnchor={() => removeAnchor("onWon")}
        />
        <PrizeEffectPicker
          title="When Out of Stock"
          value={onOutOfStock}
          onChange={(patch) => onChange({ onOutOfStock: { ...onOutOfStock, ...patch } })}
          anchorMode={anchorModeFor("onOutOfStock")}
          onStartEditingAnchor={() => startEditingAnchor("onOutOfStock", onOutOfStock.focus ?? DEFAULT_PRIZE_GROUP_EFFECT)}
          onDoneAnchor={() => doneAnchor("onOutOfStock")}
          onRemoveAnchor={() => removeAnchor("onOutOfStock")}
        >
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
          </div>
        </PrizeEffectPicker>
      </div>
    </div>
  );
}
