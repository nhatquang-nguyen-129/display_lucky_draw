import { useEffect, useMemo, useState } from "react";
import {
  BUTTON_ACTION_LABELS,
  ButtonAction,
  ButtonProps,
  computeActiveParticipantCoreFields,
  getParticipantField,
  listParticipantColumnsForType,
} from "@/lib/landing/types";
import { Participant } from "@/types";
import ColorField from "./ColorField";

interface ButtonPanelProps {
  props: ButtonProps;
  // Dùng để lọc cột nào đang gán Data Type = URL VÀ thực sự có dữ liệu, cho picker "Source" khi
  // action = "openLink" — xem urlColumns bên dưới, cùng cách LiveTextPanel.tsx làm với "Source" của
  // Winner Name (Data Type = Name), tránh cho chọn 1 field rỗng khiến nút không bao giờ mở được gì.
  participants: Participant[];
  // session.participant_column_types — để biết cột nào đang gán Data Type = URL (xem
  // listParticipantColumnsForType trong lib/landing/types.ts).
  columnTypesJson: string | null;
  // Action nào (trừ "none") đã bị 1 Button KHÁC trên trang chiếm rồi (tính sẵn ở PropertiesPanel.tsx
  // vì nó cần đọc config.components, panel này không có) — key = action, value = tên Button đang
  // giữ nó, dùng để disable option đó + hiện lý do khi hover.
  usedActionOwners: Partial<Record<ButtonAction, string>>;
  onChange: (patch: Partial<ButtonProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

// Tên ngắn thuần, không kèm giải thích — giữ nguyên value nội bộ ("reset", "toggleScoreboard",
// "openLink"...) trong ButtonAction/ButtonView.tsx, chỉ đổi CHỮ HIỂN THỊ ở đây. Không còn action
// "Discard" riêng — đã gộp vào "Draw" (bấm Draw lúc đang có candidate chờ Confirm tự quay lại, xem
// ButtonView.tsx's runAction). "confirm"/"reset"/"toggleScoreboard"/"openLink" lấy CHUNG từ
// BUTTON_ACTION_LABELS (lib/landing/types.ts) — đúng y chữ sẽ tự hiện lên nút ở ButtonView.tsx, vì đã
// bỏ ô Label thủ công (xem ghi chú cạnh field Label cũ, giờ chỉ còn dùng lúc action = "none").
const ACTION_LABELS: Record<ButtonAction, string> = {
  none: "None",
  draw: "Draw",
  ...BUTTON_ACTION_LABELS,
} as Record<ButtonAction, string>;

const ACTION_ORDER: ButtonAction[] = ["none", "draw", "confirm", "reset", "toggleScoreboard", "openLink"];

// Button chạy đúng 1 action CỐ ĐỊNH khi bấm (xem ButtonView.tsx) — panel này chỉ chọn action đó +
// styling thị giác. "openLink" cần thêm picker Source (URL), y hệt LinkOpenerPanel.tsx (đã gộp vào
// đây từ lúc bỏ Trigger Graph — không còn 1 component "Link Opener" riêng nữa). 1 nhóm "Basic
// options" phẳng DUY NHẤT — cùng khuôn đã dùng cho các panel khác. Button KHÔNG có nhóm "Self
// Interactions"/"Interactions with Draw" — action chạy NGAY lúc bấm, không có giai đoạn/trạng thái
// nào khác để cấu hình riêng.
export default function ButtonPanel({ props, participants, columnTypesJson, usedActionOwners, onChange }: ButtonPanelProps) {
  // Dropdown Action tự dựng (không dùng <select> gốc) — <select> native không cho chèn tooltip
  // riêng vào từng option (đóng khung bởi OS, không style/nội dung tuỳ ý được), mà yêu cầu là phải
  // hiện được lý do 1 action bị khoá ngay khi hover, nên phải tự vẽ danh sách bằng div/button.
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  useEffect(() => {
    if (!actionMenuOpen) return;
    const close = () => setActionMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [actionMenuOpen]);

  // Cột nào đang gán Data Type = URL VÀ thực sự có dữ liệu — CHỈ những cột này mới hợp lý cho 1 nút
  // "Open Link" (khác Lucky Wheel, nơi field nào cũng dùng được làm identifier/chữ hiển thị). Lọc
  // thêm lớp "có dữ liệu thật" giống LiveTextPanel.tsx's nameColumns — participant_column_types là
  // config CỘNG DỒN, không tự dọn khi cột biến mất khỏi dữ liệu thật.
  const activeCoreFields = useMemo(() => computeActiveParticipantCoreFields(participants), [participants]);
  const urlColumns = useMemo(() => {
    const configured = listParticipantColumnsForType(columnTypesJson, activeCoreFields, "url");
    return configured.filter((col) => participants.some((p) => getParticipantField(p, col).trim()));
  }, [participants, columnTypesJson, activeCoreFields]);

  // Tự chuyển urlField đang lưu sang cột URL thật đầu tiên ngay khi nó đang trỏ vào 1 cột không còn
  // gán Data Type = URL (vd landing cũ lưu field cố định "name"/"phone"/"code"/"email" từ trước khi
  // Source đổi sang lọc theo Data Type, hoặc cột đã bị đổi Data Type/xoá ở Data Editor) — tránh
  // <select> kẹt lại 1 giá trị không còn khớp option nào (cùng cách LuckyWheelPanel.tsx tự sửa
  // drawField/displayField/winnerDisplayField phantom).
  useEffect(() => {
    if (props.action !== "openLink") return;
    if (!props.urlField || urlColumns.includes(props.urlField)) return;
    if (urlColumns[0]) onChange({ urlField: urlColumns[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.action, props.urlField, urlColumns]);

  return (
    <div className="space-y-3">
      <span className={groupLabelClass}>Basic options</span>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <label className={labelClass}>Action</label>
        <button
          type="button"
          onClick={() => setActionMenuOpen((v) => !v)}
          className={`${fieldClass} flex items-center justify-between gap-2 text-left`}
        >
          {/* Landing cũ lưu trước khi gộp "Discard" vào "Draw" có thể còn action "redo" — value đó
              không còn khớp key nào trong ACTION_LABELS, hiện tạm chính chuỗi gốc thay vì "undefined"
              để không trông như lỗi (đổi lại action khác trong dropdown là hết ngay). */}
          <span className="truncate">{ACTION_LABELS[props.action] ?? props.action}</span>
          <span className="shrink-0 text-base-500">▾</span>
        </button>
        {actionMenuOpen && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-visible rounded border border-base-700 bg-base-800 py-1 shadow-2xl">
            {ACTION_ORDER.map((a) => {
              // "none" không phải 1 action thật (chưa cấu hình gì) nên không giới hạn — nhiều Button
              // đều để "None" là bình thường, chỉ action THẬT mới tối đa 1 Button/action.
              const usedBy = a !== "none" ? usedActionOwners[a] : undefined;
              const disabled = !!usedBy;
              return (
                <div key={a} className="group relative">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange({ action: a });
                      setActionMenuOpen(false);
                    }}
                    className={`block w-full px-2 py-1.5 text-left text-xs ${
                      disabled
                        ? "cursor-not-allowed text-base-600"
                        : a === props.action
                          ? "bg-gold-500/15 text-gold-500"
                          : "text-base-100 hover:bg-base-700"
                    }`}
                  >
                    {ACTION_LABELS[a]}
                  </button>
                  {disabled && (
                    <div className="pointer-events-none absolute right-full top-1/2 z-30 mr-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-base-100 px-2 py-1 text-[10px] font-medium text-base-950 opacity-0 shadow-lg transition-opacity delay-150 group-hover:opacity-100">
                      Already used by "{usedBy}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {props.action === "openLink" && (
        <div>
          <label className={labelClass}>Source</label>
          {urlColumns.length > 0 ? (
            <select
              className={fieldClass}
              value={props.urlField && urlColumns.includes(props.urlField) ? props.urlField : urlColumns[0]}
              onChange={(e) => onChange({ urlField: e.target.value })}
            >
              {urlColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          ) : (
            <select disabled className={`${fieldClass} text-base-500`}>
              <option>Set a column's Data Type to URL first.</option>
            </select>
          )}
        </div>
      )}

      {props.action === "draw" && (
        <div>
          <label className={labelClass}>Multiple Draw delay (ms)</label>
          <input
            type="number"
            min={0}
            step={100}
            className={fieldClass}
            value={props.multipleDrawPaceMs ?? 600}
            onChange={(e) => onChange({ multipleDrawPaceMs: Math.max(0, Number(e.target.value)) })}
          />
        </div>
      )}

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
          <label className={labelClass}>Text color</label>
          <ColorField value={props.color} onChange={(color) => onChange({ color })} />
        </div>
        <div>
          <label className={labelClass}>Background</label>
          <ColorField value={props.backgroundColor} onChange={(backgroundColor) => onChange({ backgroundColor })} />
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
        <div>
          <label className={labelClass}>Stroke color</label>
          <ColorField value={props.strokeColor} onChange={(strokeColor) => onChange({ strokeColor })} />
        </div>
        <div>
          <label className={labelClass}>Stroke width</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={props.strokeWidth}
            onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
