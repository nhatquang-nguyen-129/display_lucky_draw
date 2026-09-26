import { useMemo, useState } from "react";
import {
  computeActiveParticipantCoreFields,
  DrawRestState,
  getParticipantField,
  listParticipantColumnsForType,
  LiveTextProps,
  WINNER_TRANSITION_EFFECTS,
  WinnerTransitionEffect,
} from "@/lib/landing/types";
import { Participant } from "@/types";
import ColorField from "./ColorField";

interface LiveTextPanelProps {
  props: LiveTextProps & {
    appearEffect?: WinnerTransitionEffect;
    disappearEffect?: WinnerTransitionEffect;
    appearDelayMs?: number;
    disappearDelayMs?: number;
    idleState?: DrawRestState;
    idleEffect?: WinnerTransitionEffect;
    idleDelayMs?: number;
    quickDrawText?: string;
    nameSourceColumn?: string;
  };
  // Vị trí/kích thước thật của CHÍNH component này (component.x/y/width/height) — gộp chung vào
  // "Basic options" ở đây thay vì để riêng dưới SharedFields.tsx như mọi loại component khác (xem
  // PropertiesPanel.tsx: SharedFields ẩn hẳn phần Position + Effect chung cho "winnerName", chỉ giữ
  // lại nút Delete). Đổi field NÀY phải qua `onChangeComponent` (patch top-level LandingComponent),
  // KHÁC hẳn `onChange` (patch `component.props`) — 2 tầng dữ liệu riêng biệt trong LandingConfig.
  x: number;
  y: number;
  width: number;
  height: number;
  onChangeComponent: (patch: { x?: number; y?: number; width?: number; height?: number }) => void;
  participants: Participant[];
  columnTypesJson: string | null;
  onChange: (patch: Record<string, any>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";
const detailsClass = "rounded-lg border border-base-800";
const summaryClass = "flex cursor-pointer select-none items-center justify-between px-2.5 py-2 text-xs font-medium text-base-100";
const detailsBodyClass = "space-y-2 border-t border-base-800 px-2.5 pb-2.5 pt-2.5";
const arrowLabelClass = "text-[10px] font-normal normal-case text-base-500";

// Effect + Delay trên CÙNG 1 hàng — đúng layout `effectFields` của DrawCycleFields.tsx (Text/Image/
// Background), để 3 mục Idle/Draw/Redraw của Winner Name nhìn đồng bộ 1 kiểu với các panel đó.
// Dropdown Appearance CỐ ĐỊNH (disabled, đúng 1 giá trị) cho Draw/Redraw — Winner Name luôn hiện tên
// mới lúc Draw và ẩn tên cũ lúc Redraw (nội dung đổi theo từng lượt, không có lựa chọn nào khác có
// nghĩa), nhưng vẫn hiện field này để 3 mục Idle/Draw/Redraw cùng khuôn với DrawCycleFields.tsx.
const lockedClass = "cursor-not-allowed opacity-70";

function fixedAppearance(label: string) {
  return (
    <div>
      <label className={labelClass}>Appearance</label>
      <select disabled className={`${fieldClass} ${lockedClass}`} value={label}>
        <option value={label}>{label}</option>
      </select>
    </div>
  );
}

function effectDelayRow(
  effect: WinnerTransitionEffect | undefined,
  delayMs: number | undefined,
  onEffect: (effect: WinnerTransitionEffect) => void,
  onDelay: (delayMs: number | undefined) => void,
  // Khoá (disabled) thay vì ẩn hẳn — giữ layout cố định, xem chỗ gọi ở mục Idle.
  locked = false
) {
  const cls = locked ? `${fieldClass} ${lockedClass}` : fieldClass;
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelClass}>Effect</label>
        <select
          disabled={locked}
          className={cls}
          value={effect ?? "none"}
          onChange={(e) => onEffect(e.target.value as WinnerTransitionEffect)}
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
          disabled={locked}
          className={cls}
          value={delayMs ?? ""}
          onChange={(e) => onDelay(e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))}
        />
      </div>
    </div>
  );
}

// Cùng khuôn "Basic options" phẳng + "Interactions with Draw" đã dùng cho các panel khác, và đặt tên
// mục theo ĐÚNG thuật ngữ Idle/Draw/Redraw chung với ImagePanel.tsx/TextPanel.tsx (xem DrawCycleFields
// .tsx) — nhưng KHÔNG dùng chung cơ chế/schema đó (`DrawCycleConfig`): Winner Name không có checkbox
// "Trigger with Draw" (LUÔN bật — cả component chỉ tồn tại để phản ứng theo Draw). Mục "Idle" CŨNG có
// dropdown Appearance như Image/Text (đồng bộ hình dáng UI), nhưng Ý NGHĨA khác: "Disappear" (mặc
// định) = ẩn tên khi Reset như cũ; "Appear" = GIỮ NGUYÊN tên đang hiện, Reset không xoá gì — xem
// doc-comment WinnerNameProps.idleState trong types.ts (KHÔNG ảnh hưởng lúc mở lại landing, vẫn luôn
// rỗng lúc mount). Lý do khác biệt còn lại: NỘI DUNG Winner Name (tên người trúng) THẬT SỰ đổi theo
// TỪNG lượt quay — khác Image/Text (1 thứ TĨNH do người dùng tự đặt, không đổi theo lượt) — nên vẫn
// dùng cơ chế `useRevealed`/`useRevealTransition` riêng (xem drawRevealHooks.ts), không migrate sang
// `useDrawCycleVisibility`. Thứ tự 2 nhóm dưới "Basic options": "Self Interactions" TRƯỚC (đúng thứ
// tự chuẩn ở BackgroundPanel.tsx/LiveImagePanel.tsx/LuckyWheelPanel.tsx), "Interactions with Draw"
// SAU. "Self Interactions" chỉ có ĐÚNG 1 mục "Quick Draw" (không tiền tố "When ", bỏ cho gọn cùng đợt
// với LiveImagePanel.tsx — Quick Draw text hiện thay tên khi
// 1 Quick Draw vừa chạy xong) — TÁCH RIÊNG khỏi "Interactions with Draw" vì không thuộc khái niệm
// Idle/Draw/Redraw theo từng lượt, không phải Winner Name "tự" phản ứng click/hover (Winner Name
// không bị thao tác trực tiếp) mà vì Quick Draw là 1 luồng khác hẳn Draw đơn lẻ. "Interactions with
// Draw" có 3 mục:
//   - "Idle" (MỚI — Appearance + Effect + Delay riêng cho lúc Reset, xem doc-comment
//     WinnerNameProps.idleState/idleEffect trong types.ts. Effect/Delay CHỈ có tác dụng khi Appearance
//     = Disappear — Appear không có gì để chạy hiệu ứng, vì không đổi gì cả. Mặc định undefined =
//     "disappear" + ẩn NGAY LẬP TỨC không hiệu ứng, giữ đúng hành vi cũ. KHÔNG dùng chung
//     `disappearEffect`/`disappearDelayMs` — Reset là 1 sự kiện khác hẳn Redraw)
//   - "Draw" (trước đây "When Revealed" — Appear effect + Delay — kích hoạt bằng hành vi bấm Draw, dù
//     đang Idle hay đang hiện tên của lượt trước, Delay luôn tính từ đúng lúc bấm Draw đó)
//   - "Redraw" (trước đây "When Disappear" — Disappear effect + Delay, xử lý nội dung CŨ đã có — CHỈ
//     có ý nghĩa khi đang hiện tên của lượt trước; tên MỚI sau đó hiện ra dùng CHÍNH Effect của "Draw"
//     ở trên, giống ImagePanel.tsx/TextPanel.tsx, chỉ khác: 2 mốc thời gian ĐO ĐỘC LẬP từ CÙNG 1 lúc
//     bấm Draw — KHÔNG nối tiếp/chờ nhau như DrawCycleConfig — giữ nguyên hành vi đã có, không đổi
//     choreography của 1 tính năng đã hoạt động ổn định)
export default function LiveTextPanel({
  props,
  x,
  y,
  width,
  height,
  onChangeComponent,
  participants,
  columnTypesJson,
  onChange,
}: LiveTextPanelProps) {
  const [idleOpen, setIdleOpen] = useState(true);
  const [revealedOpen, setRevealedOpen] = useState(true);
  const [disappearOpen, setDisappearOpen] = useState(true);
  const [quickDrawOpen, setQuickDrawOpen] = useState(true);
  const idleState = props.idleState ?? "disappear";

  // Mọi cột đang gán Data Type = Name VÀ còn dữ liệu thật trong Participants hiện tại — LỌC THÊM lớp
  // "có dữ liệu thật" (giống hasDataForField trong LuckyWheelPanel.tsx) vì `columnTypesJson` (session.
  // participant_column_types) là 1 config CỘNG DỒN, KHÔNG tự dọn khi cột biến mất khỏi dữ liệu thật
  // (vd sau khi Replace import bằng file header khác) — thiếu bước lọc này, cột đã bị Replace từ lâu
  // (0/N participant hiện tại còn cột đó) vẫn hiện ra như 1 lựa chọn hợp lệ (bug đã gặp thật).
  const nameColumns = useMemo(() => {
    const activeCoreFields = computeActiveParticipantCoreFields(participants);
    const configured = listParticipantColumnsForType(columnTypesJson, activeCoreFields, "name");
    return configured.filter((col) => participants.some((p) => getParticipantField(p, col).trim()));
  }, [participants, columnTypesJson]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Font size</label>
            <input
              type="number"
              className={fieldClass}
              value={props.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Color</label>
            <ColorField value={props.color} onChange={(color) => onChange({ color })} />
          </div>
          <div>
            <label className={labelClass}>Weight</label>
            <select
              className={fieldClass}
              value={props.fontWeight}
              onChange={(e) => onChange({ fontWeight: e.target.value as LiveTextProps["fontWeight"] })}
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Align</label>
            <select
              className={fieldClass}
              value={props.align}
              onChange={(e) => onChange({ align: e.target.value as LiveTextProps["align"] })}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Source</label>
          {nameColumns.length > 0 ? (
            <select
              className={fieldClass}
              value={props.nameSourceColumn ?? nameColumns[0]}
              onChange={(e) => onChange({ nameSourceColumn: e.target.value })}
            >
              {nameColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          ) : (
            <select disabled className={`${fieldClass} text-base-500`}>
              <option>Set a column's Data Type to Name first.</option>
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>X</label>
            <input
              type="number"
              className={fieldClass}
              value={Math.round(x)}
              onChange={(e) => onChangeComponent({ x: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Y</label>
            <input
              type="number"
              className={fieldClass}
              value={Math.round(y)}
              onChange={(e) => onChangeComponent({ y: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Width</label>
            <input
              type="number"
              className={fieldClass}
              value={Math.round(width)}
              onChange={(e) => onChangeComponent({ width: Math.max(1, Number(e.target.value)) })}
            />
          </div>
          <div>
            <label className={labelClass}>Height</label>
            <input
              type="number"
              className={fieldClass}
              value={Math.round(height)}
              onChange={(e) => onChangeComponent({ height: Math.max(1, Number(e.target.value)) })}
            />
          </div>
        </div>
      </div>

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Self Interactions</span>
        <details open={quickDrawOpen} onToggle={(e) => setQuickDrawOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>Quick Draw</summary>
          <div className={detailsBodyClass}>
            <div>
              <label className={labelClass}>Quick Draw text</label>
              <input
                className={fieldClass}
                value={props.quickDrawText ?? "Congratulations!"}
                onChange={(e) => onChange({ quickDrawText: e.target.value })}
              />
            </div>
          </div>
        </details>
      </div>

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Interactions with Draw</span>
        <details open={idleOpen} onToggle={(e) => setIdleOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>
            Idle
            <span className={arrowLabelClass}>on Reset → {idleState === "appear" ? "Appear" : "Disappear"}</span>
          </summary>
          <div className={detailsBodyClass}>
            <div>
              <label className={labelClass}>Appearance</label>
              <select
                className={fieldClass}
                value={idleState}
                onChange={(e) => onChange({ idleState: e.target.value as DrawRestState })}
              >
                <option value="appear">Appear</option>
                <option value="disappear">Disappear</option>
              </select>
            </div>
            {/* Appear = Reset giữ nguyên tên, không có gì để chạy hiệu ứng (idleEffect/idleDelayMs không
                bao giờ được đọc, xem useRevealed) — vẫn hiện Effect/Delay nhưng KHOÁ lại cho cùng khuôn
                với Draw/Redraw, giá trị đã lưu giữ nguyên để dùng lại khi đổi về Disappear. */}
            {effectDelayRow(
              props.idleEffect,
              props.idleDelayMs,
              (idleEffect) => onChange({ idleEffect }),
              (idleDelayMs) => onChange({ idleDelayMs }),
              idleState === "appear"
            )}
          </div>
        </details>
        <details open={revealedOpen} onToggle={(e) => setRevealedOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>
            Draw
            <span className={arrowLabelClass}>→ Appear</span>
          </summary>
          <div className={detailsBodyClass}>
            {fixedAppearance("Appear")}
            {effectDelayRow(
              props.appearEffect,
              props.appearDelayMs,
              (appearEffect) => onChange({ appearEffect }),
              (appearDelayMs) => onChange({ appearDelayMs })
            )}
          </div>
        </details>
        <details open={disappearOpen} onToggle={(e) => setDisappearOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>
            Redraw
            <span className={arrowLabelClass}>→ Disappear</span>
          </summary>
          <div className={detailsBodyClass}>
            {fixedAppearance("Disappear")}
            {effectDelayRow(
              props.disappearEffect,
              props.disappearDelayMs,
              (disappearEffect) => onChange({ disappearEffect }),
              (disappearDelayMs) => onChange({ disappearDelayMs })
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
