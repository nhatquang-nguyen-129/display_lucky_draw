import { ReactNode, useState } from "react";
import {
  DEFAULT_PRIZE_GROUP_EFFECT,
  DEFAULT_PRIZE_STAGE_EFFECT,
  PRIZE_APPEARANCE_NAMES,
  PRIZE_EFFECT_GROUPS,
  PrizeAppearanceName,
  PrizeEffectName,
  PrizeGroupEffect,
  PrizeStageEffect,
} from "@/lib/landing/types";
import LiftDirectionTrigger from "./LiftDirectionTrigger";
import ScaleAnchorTrigger from "./ScaleAnchorTrigger";

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

const EFFECT_LABELS: Record<PrizeEffectName, string> = {
  none: "None",
  scaleUp: "Scale Up",
  lift: "Lift",
  glow: "Glow",
  sweep: "Sweep",
  bounce: "Bounce",
  pulse: "Pulse",
  shake: "Shake",
};

const APPEARANCE_LABELS: Record<PrizeAppearanceName, string> = {
  none: "None",
  disappear: "Disappear",
};

// Nhãn + khoảng giá trị cho field "size" — Ý NGHĨA THEO TỪNG EFFECT, xem doc-comment PrizeGroupEffect
// trong types.ts. "sweep" không có trong map này (không dùng field size). "scaleUp" VÀ "lift" CŨNG
// không còn ở đây nữa — mức độ giờ kéo-thả trực tiếp trên canvas (điểm "Direction", xem
// ScaleAnchorOverlay.tsx), không còn ô nhập số riêng.
const SIZE_LABEL: Partial<Record<PrizeEffectName, string>> = {
  glow: "Glow size (px)",
  bounce: "Bounce height (px)",
  pulse: "Pulse amount (%)",
  shake: "Shake distance (px)",
};
const SIZE_RANGE: Partial<Record<PrizeEffectName, [number, number]>> = {
  glow: [4, 80],
  bounce: [0, 40],
  pulse: [0, 40],
  shake: [0, 20],
};

// 1 dropdown + field phụ cho ĐÚNG 1 NHÓM (Focus/Highlight/Motion) — dropdown CHỈ liệt kê effect thuộc
// nhóm đó (giới hạn ở đúng 1 lựa chọn TRONG nhóm, xem doc-comment PrizeStageEffect trong types.ts).
function GroupEffectFields({
  groupLabel,
  effects,
  value,
  onChange,
  anchorMode,
  onStartEditingAnchor,
  onDoneAnchor,
  onRemoveAnchor,
}: {
  groupLabel: string;
  effects: PrizeEffectName[];
  value: PrizeGroupEffect;
  onChange: (patch: Partial<PrizeGroupEffect>) => void;
  // CHỈ có ý nghĩa ở nhóm "focus" (nhóm DUY NHẤT chứa scaleUp VÀ lift) — xem doc-comment PrizeEffectPicker
  // bên dưới.
  anchorMode?: "placing" | "editing" | "locked" | null;
  onStartEditingAnchor?: () => void;
  onDoneAnchor?: () => void;
  onRemoveAnchor?: () => void;
}) {
  const showColor = value.effect === "glow";
  // Dùng CHÍNH SIZE_LABEL làm "danh sách trắng" (effect nào có nhãn thì mới có field size) thay vì
  // liệt kê loại trừ ("khác none và khác sweep") — bản loại trừ từng gây bug thật: landing cũ lỡ lưu
  // 1 effect ĐÃ BỊ BỎ (vd "spotlight", xem doc-comment PrizeEffectName trong types.ts) vẫn "khác none
  // và khác sweep" nên field Amount vẫn hiện ra dù dropdown hiển thị "None" (effect không khớp option
  // nào, trình duyệt tự hiện option ĐẦU TIÊN) — danh sách trắng tự động AN TOÀN với mọi effect lạ/cũ,
  // không cần liệt kê riêng từng trường hợp.
  const showSize = SIZE_LABEL[value.effect] !== undefined;
  // scaleUp và lift ĐỀU kéo-thả điểm "Direction" TRỰC TIẾP TRÊN CANVAS thật (nút bật/tắt ở đây,
  // kéo-thả thật sự diễn ra ở ScaleAnchorOverlay.tsx trong LandingCanvas.tsx) — khác nhau ở ĐIỂM CỐ
  // ĐỊNH: scaleUp có Anchor do người dùng CHỦ ĐỘNG thả (ScaleAnchorTrigger.tsx); lift LUÔN cố định
  // sẵn ở chính giữa khung, không cần thả (LiftDirectionTrigger.tsx, không có mode "placing") — xem
  // doc-comment PrizeGroupEffect trong types.ts.
  const showScaleAnchor = value.effect === "scaleUp";
  const showLiftDirection = value.effect === "lift";
  const [sizeMin, sizeMax] = SIZE_RANGE[value.effect] ?? [0, 100];

  return (
    <div className="space-y-2 rounded border border-base-800/70 p-2">
      <div>
        <label className={labelClass}>{groupLabel}</label>
        <select
          className={fieldClass}
          value={value.effect}
          onChange={(e) => onChange({ effect: e.target.value as PrizeEffectName })}
        >
          <option value="none">None</option>
          {effects.map((effect) => (
            <option key={effect} value={effect}>
              {EFFECT_LABELS[effect]}
            </option>
          ))}
        </select>
      </div>

      {(showColor || showSize) && (
        <div className="grid grid-cols-2 gap-2">
          {showColor && (
            <div>
              <label className={labelClass}>Color</label>
              <input
                type="color"
                className="h-[26px] w-full rounded border border-base-700 bg-base-800"
                value={value.color}
                onChange={(e) => onChange({ color: e.target.value })}
              />
            </div>
          )}
          {showSize && (
            <div>
              <label className={labelClass}>{SIZE_LABEL[value.effect] ?? "Amount"}</label>
              <input
                type="number"
                min={sizeMin}
                max={sizeMax}
                className={fieldClass}
                value={value.size}
                onChange={(e) => onChange({ size: Number(e.target.value) })}
              />
            </div>
          )}
        </div>
      )}

      {showScaleAnchor && (
        <div>
          <label className={labelClass}>Anchor &amp; direction</label>
          <ScaleAnchorTrigger
            x={value.directionX}
            y={value.directionY}
            anchorPlaced={value.anchorPlaced}
            mode={anchorMode ?? null}
            onStartEditing={() => onStartEditingAnchor?.()}
            onDone={() => onDoneAnchor?.()}
            onRemove={() => {
              onChange({
                directionX: DEFAULT_PRIZE_GROUP_EFFECT.directionX,
                directionY: DEFAULT_PRIZE_GROUP_EFFECT.directionY,
                handleX: DEFAULT_PRIZE_GROUP_EFFECT.handleX,
                handleY: DEFAULT_PRIZE_GROUP_EFFECT.handleY,
                anchorPlaced: false,
              });
              onRemoveAnchor?.();
            }}
          />
        </div>
      )}

      {showLiftDirection && (
        <div>
          <label className={labelClass}>Direction</label>
          <LiftDirectionTrigger
            configured={value.handleX !== 50 || value.handleY !== 50}
            mode={anchorMode ?? null}
            onStartEditing={() => onStartEditingAnchor?.()}
            onDone={() => onDoneAnchor?.()}
            onReset={() => {
              onChange({ handleX: 50, handleY: 50 });
              onRemoveAnchor?.();
            }}
          />
        </div>
      )}
    </div>
  );
}

// Panel con DÙNG CHUNG cho cả 4 mục When Hover/Select/Won/Out of Stock (LiveImagePanel.tsx) — GỘP 3
// nhóm ĐỘC LẬP (Focus/Highlight/Motion, xem PRIZE_EFFECT_GROUPS trong
// types.ts) trong CÙNG 1 <details>: mỗi nhóm tự có dropdown + field phụ riêng (color/size/direction
// theo đúng effect nhóm đó đang chọn), và có thể BẬT ĐỒNG THỜI (vd vừa Focus vừa Highlight) — chỉ
// riêng TRONG 1 nhóm mới giới hạn ĐÚNG 1 effect. Bọc trong <details> — mặc định MỞ nếu BẤT KỲ nhóm
// nào đang khác "none" (không giấu cấu hình đã set), sau đó hoàn toàn do người dùng tự đóng/mở (không
// ép lại theo re-render — cùng kỹ thuật `useState(() => ...)` đã dùng cho "Interact with Wheel" ở
// BackgroundPanel.tsx).
export default function PrizeEffectPicker({
  title,
  value,
  onChange,
  anchorMode,
  onStartEditingAnchor,
  onDoneAnchor,
  onRemoveAnchor,
  children,
}: {
  title: string;
  value: PrizeStageEffect;
  onChange: (patch: Partial<PrizeStageEffect>) => void;
  // Chuyển THẲNG xuống nhóm "focus" — group DUY NHẤT chứa scaleUp VÀ lift (xem PRIZE_EFFECT_GROUPS).
  // Optional vì không phải mọi caller cần bật tính năng này (chỉ LiveImagePanel.tsx, nơi component
  // đang sửa THẬT SỰ vẽ được trên canvas — xem doc-comment ScaleAnchorOverlay.tsx).
  anchorMode?: "placing" | "editing" | "locked" | null;
  onStartEditingAnchor?: () => void;
  onDoneAnchor?: () => void;
  onRemoveAnchor?: () => void;
  // Nội dung phụ (vd thanh Dim amount của "When Out of Stock") hiện TRƯỚC 3 nhóm Focus/Highlight/
  // Motion, TRONG CÙNG 1 <details> — dùng để gộp "When Out of Stock" vào chung khuôn 4 mục When...,
  // không cần lồng thêm 1 <details> con riêng cho phần effect (giữ đúng 2 cấp: Self Interactions →
  // When...).
  children?: ReactNode;
}) {
  // Lớp phòng thủ THỨ 2 (gọi viên đã tự fallback ở LiveImagePanel.tsx rồi) —
  // phòng trường hợp 1 caller sau này quên fallback, tránh crash trắng màn hình y hệt bug đã gặp, xem
  // doc-comment DEFAULT_PRIZE_STAGE_EFFECT trong types.ts. Mỗi nhóm con fallback RIÊNG vì config lưu
  // bởi bản trước khi có 3-nhóm (hoặc landing rất cũ trước cả 4-giai-đoạn) thiếu hẳn `focus`/
  // `highlight`/`motion`, dù `value` object CÓ tồn tại.
  const stage = value ?? DEFAULT_PRIZE_STAGE_EFFECT;
  const focus = stage.focus ?? DEFAULT_PRIZE_GROUP_EFFECT;
  const highlight = stage.highlight ?? DEFAULT_PRIZE_GROUP_EFFECT;
  const motion = stage.motion ?? DEFAULT_PRIZE_GROUP_EFFECT;
  const appearance = stage.appearance ?? "none";
  const anyActive = focus.effect !== "none" || highlight.effect !== "none" || motion.effect !== "none" || appearance !== "none";
  const [open, setOpen] = useState(() => anyActive);
  const groupValues: Record<"focus" | "highlight" | "motion", PrizeGroupEffect> = { focus, highlight, motion };

  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="rounded-lg border border-base-800">
      <summary className="cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-base-100">{title}</summary>
      <div className="space-y-2 border-t border-base-800 px-2.5 pb-2.5 pt-2.5">
        {children}

        {PRIZE_EFFECT_GROUPS.map((group) => (
          <GroupEffectFields
            key={group.key}
            groupLabel={group.label}
            effects={group.effects}
            value={groupValues[group.key]}
            onChange={(patch) => onChange({ [group.key]: { ...groupValues[group.key], ...patch } })}
            anchorMode={group.key === "focus" ? anchorMode : undefined}
            onStartEditingAnchor={group.key === "focus" ? onStartEditingAnchor : undefined}
            onDoneAnchor={group.key === "focus" ? onDoneAnchor : undefined}
            onRemoveAnchor={group.key === "focus" ? onRemoveAnchor : undefined}
          />
        ))}

        <div className="space-y-2 rounded border border-base-800/70 p-2">
          <div>
            <label className={labelClass}>Appearance</label>
            <select
              className={fieldClass}
              value={appearance}
              onChange={(e) => onChange({ appearance: e.target.value as PrizeAppearanceName })}
            >
              <option value="none">None</option>
              {PRIZE_APPEARANCE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {APPEARANCE_LABELS[name]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </details>
  );
}
