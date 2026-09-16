import { useMemo, useState } from "react";
import {
  computeActiveParticipantCoreFields,
  getParticipantField,
  listParticipantColumnsForType,
  LiveTextProps,
  WINNER_TRANSITION_EFFECTS,
  WinnerTransitionEffect,
} from "@/lib/landing/types";
import { Participant } from "@/types";

interface LiveTextPanelProps {
  props: LiveTextProps & {
    appearEffect?: WinnerTransitionEffect;
    disappearEffect?: WinnerTransitionEffect;
    quickDrawText?: string;
    nameSourceColumn?: string;
  };
  participants: Participant[];
  columnTypesJson: string | null;
  onChange: (patch: Record<string, any>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";
const detailsClass = "rounded-lg border border-base-800";
const summaryClass = "cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-base-100";
const detailsBodyClass = "space-y-3 border-t border-base-800 px-2.5 pb-2.5 pt-2.5";

// Cùng khuôn "Basic options" phẳng + "Interactions with Draw" đã dùng cho các panel khác — KHÔNG có
// "Self Interactions" (Winner Name không bị click/hover/select trực tiếp, mọi thứ nó làm đều VÌ Draw
// đã chạy). Không còn "Fallback text" — lúc Idle component ẩn hẳn (nội dung rỗng), thay bằng đúng 1
// cặp Appear/Disappear:
//   - "When Revealed" (Appear effect — đúng khoảnh khắc tên thật xuất hiện)
//   - "When Idle" (Disappear effect — đúng khoảnh khắc quay lại rỗng, Reset hoặc 1 lượt Draw mới vừa
//     bắt đầu)
//   - "When Quick Draw" (Quick Draw text — hiện thay tên khi 1 Quick Draw vừa chạy xong)
export default function LiveTextPanel({ props, participants, columnTypesJson, onChange }: LiveTextPanelProps) {
  const [revealedOpen, setRevealedOpen] = useState(true);
  const [idleOpen, setIdleOpen] = useState(true);
  const [quickDrawOpen, setQuickDrawOpen] = useState(true);

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
            <input
              type="color"
              className="h-[26px] w-full rounded border border-base-700 bg-base-800"
              value={props.color}
              onChange={(e) => onChange({ color: e.target.value })}
            />
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
      </div>

      <div className="h-px bg-base-800" />

      <div className="space-y-2">
        <span className={groupLabelClass}>Interactions with Draw</span>
        <details open={revealedOpen} onToggle={(e) => setRevealedOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>When Revealed</summary>
          <div className={detailsBodyClass}>
            <div>
              <label className={labelClass}>Appear effect</label>
              <select
                className={fieldClass}
                value={props.appearEffect ?? "none"}
                onChange={(e) => onChange({ appearEffect: e.target.value as WinnerTransitionEffect })}
              >
                {WINNER_TRANSITION_EFFECTS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
        <details open={idleOpen} onToggle={(e) => setIdleOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>When Idle</summary>
          <div className={detailsBodyClass}>
            <div>
              <label className={labelClass}>Disappear effect</label>
              <select
                className={fieldClass}
                value={props.disappearEffect ?? "none"}
                onChange={(e) => onChange({ disappearEffect: e.target.value as WinnerTransitionEffect })}
              >
                {WINNER_TRANSITION_EFFECTS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
        <details open={quickDrawOpen} onToggle={(e) => setQuickDrawOpen(e.currentTarget.open)} className={detailsClass}>
          <summary className={summaryClass}>When Quick Draw</summary>
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
    </div>
  );
}
