import { useEffect, useMemo, useState } from "react";
import { ButtonAction, ButtonProps, getParticipantExtraField } from "@/lib/landing/types";
import { Participant } from "@/types";

interface ButtonPanelProps {
  props: ButtonProps;
  // Dùng để liệt kê MỌI cột optional (extra_data) đang thực sự có dữ liệu trong session này, cho
  // picker "URL field" khi action = "openLink" — cùng cách LuckyWheelPanel.tsx làm với
  // drawField/displayField, tránh cho chọn 1 field rỗng khiến nút không bao giờ mở được gì.
  participants: Participant[];
  // Action nào (trừ "none") đã bị 1 Button KHÁC trên trang chiếm rồi (tính sẵn ở PropertiesPanel.tsx
  // vì nó cần đọc config.components, panel này không có) — key = action, value = tên Button đang
  // giữ nó, dùng để disable option đó + hiện lý do khi hover.
  usedActionOwners: Partial<Record<ButtonAction, string>>;
  onChange: (patch: Partial<ButtonProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

// Tên ngắn thuần, không kèm giải thích — giữ nguyên value nội bộ ("reset", "toggleScoreboard",
// "openLink"...) trong ButtonAction/ButtonView.tsx, chỉ đổi CHỮ HIỂN THỊ ở đây. Không còn action
// "Discard" riêng — đã gộp vào "Draw" (bấm Draw lúc đang có candidate chờ Confirm tự quay lại, xem
// ButtonView.tsx's runAction).
const ACTION_LABELS: Record<ButtonAction, string> = {
  none: "None",
  draw: "Draw",
  confirm: "Confirm",
  reset: "Reset",
  toggleScoreboard: "Scoreboard",
  openLink: "Open Link",
};

const ACTION_ORDER: ButtonAction[] = ["none", "draw", "confirm", "reset", "toggleScoreboard", "openLink"];

const FIXED_FIELD_OPTIONS = [
  { value: "code", label: "Code" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "name", label: "Name" },
];

// Button chạy đúng 1 action CỐ ĐỊNH khi bấm (xem ButtonView.tsx) — panel này chỉ chọn action đó +
// styling thị giác. "openLink" cần thêm picker URL field, y hệt LinkOpenerPanel.tsx (đã gộp vào
// đây từ lúc bỏ Trigger Graph — không còn 1 component "Link Opener" riêng nữa).
export default function ButtonPanel({ props, participants, usedActionOwners, onChange }: ButtonPanelProps) {
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

  const extraColumns = useMemo(() => {
    const keys = new Set<string>();
    participants.forEach((p) => {
      if (!p.extra_data) return;
      try {
        const extra = JSON.parse(p.extra_data) as Record<string, string>;
        Object.keys(extra).forEach((k) => keys.add(k));
      } catch {
        // extra_data hỏng ở dòng này — bỏ qua, không chặn cả danh sách field
      }
    });
    return Array.from(keys).sort();
  }, [participants]);

  function hasDataForField(field: string): boolean {
    switch (field) {
      case "name":
        return true;
      case "phone":
        return participants.some((p) => p.phone?.trim());
      case "email":
        return participants.some((p) => p.email?.trim());
      case "code":
        return participants.some((p) => p.code?.trim());
      default:
        return participants.some((p) => getParticipantExtraField(p, field));
    }
  }

  const allFieldOptions = [...FIXED_FIELD_OPTIONS, ...extraColumns.map((k) => ({ value: k, label: k }))];
  // Vẫn giữ field ĐANG được chọn trong danh sách dù nó không còn dữ liệu, chỉ ẩn các lựa chọn rỗng
  // KHÁC — tránh <select> hiện trắng/không khớp value nào.
  const fieldOptions = allFieldOptions.filter((o) => o.value === props.urlField || hasDataForField(o.value));

  return (
    <div className="space-y-3">
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <label className={labelClass}>Action (on click)</label>
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
          <label className={labelClass}>URL field</label>
          <select
            className={fieldClass}
            value={props.urlField ?? ""}
            onChange={(e) => onChange({ urlField: e.target.value })}
          >
            <option value="">— none selected —</option>
            {fieldOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="h-px bg-base-800" />

      <div>
        <label className={labelClass}>Label</label>
        <input className={fieldClass} value={props.label} onChange={(e) => onChange({ label: e.target.value })} />
      </div>

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
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Background</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.backgroundColor}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
          />
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
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.strokeColor}
            onChange={(e) => onChange({ strokeColor: e.target.value })}
          />
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
