import { useEffect, useMemo, useRef, useState } from "react";
import { getScoreboardFieldLabel, SCOREBOARD_FIELDS, ScoreboardField, ScoreboardProps } from "@/lib/landing/types";
import { Participant } from "@/types";
import ColorField from "./ColorField";

interface ScoreboardPanelProps {
  props: ScoreboardProps;
  // Dùng để dò MỌI cột optional (extra_data) đang thực sự tồn tại trong session này — hợp nhất với
  // 6 field cố định (SCOREBOARD_FIELDS) làm danh sách cột đầy đủ có thể chọn, đúng kiểu extraColumns
  // của LuckyWheelPanel.tsx.
  participants: Participant[];
  onChange: (patch: Partial<ScoreboardProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";
const groupLabelClass = "text-[10px] font-semibold uppercase tracking-wide text-base-400";

// Config cũ (trước khi có template "table" + cột tự chọn) chỉ có showPrizeName/backgroundColor
// phẳng, thiếu hẳn columns/titleBarColor/backgroundType/backgroundImageFit — đọc thẳng sẽ crash (vd
// .includes trên undefined). Fallback giống hệt TableTemplate.tsx (2 nơi đọc CÙNG 1 dữ liệu, phải
// khớp nhau) để landing đã lưu từ trước vẫn mở sửa được, không lỗi trắng màn hình.
function normalizeProps(props: ScoreboardProps) {
  const legacy = props as unknown as { showPrizeName?: boolean };
  const columns: ScoreboardField[] =
    props.columns && props.columns.length > 0
      ? props.columns
      : legacy.showPrizeName
        ? ["participantName", "prizeName"]
        : ["participantName"];
  return {
    titleBarColor: props.titleBarColor ?? "#2244A5",
    columns,
    backgroundType: props.backgroundType ?? "color",
    backgroundImageFit: props.backgroundImageFit ?? "cover",
  };
}

// Cùng khuôn "Basic options" phẳng đã dùng cho LiveImagePanel.tsx/LuckyWheelPanel.tsx — GỘP CHUNG cả
// Name Bar/Table background/font-màu chữ (đều là field tĩnh, không nhóm riêng theo từng mục nhỏ nữa).
// KHÔNG có nhóm "Self Interactions"/"Interactions with Draw" — Scoreboard thuần hiển thị dữ liệu +
// style, không có giai đoạn tương tác/hiệu ứng nào (hiện/ẩn do 1 Button "Scoreboard" điều khiển TỪ
// BÊN NGOÀI, xem ButtonPanel.tsx, không phải cấu hình của chính component này). "Columns" là 1
// dropdown chọn nhiều (ColumnsDropdown, tick bên cạnh cột đang chọn) nằm cuối Basic options — từng là
// 1 khối <details> checkbox riêng sau Basic options, đã đổi cho gọn và cùng kiểu field với phần còn lại.
export default function ScoreboardPanel({ props, participants, onChange }: ScoreboardPanelProps) {
  const { titleBarColor, columns, backgroundType, backgroundImageFit } = normalizeProps(props);

  // Mọi tên cột optional (extra_data) đang THỰC SỰ xuất hiện ở ít nhất 1 participant trong session
  // này — nối vào sau 6 field cố định, đúng cách LuckyWheelPanel.tsx dò extraColumns.
  const extraColumns = useMemo(() => {
    const keys = new Set<string>();
    participants.forEach((p) => {
      if (!p.extra_data) return;
      try {
        const extra = JSON.parse(p.extra_data) as Record<string, string>;
        Object.keys(extra).forEach((k) => keys.add(k));
      } catch {
        // extra_data hỏng ở dòng này — bỏ qua, không chặn cả danh sách cột
      }
    });
    return Array.from(keys).sort();
  }, [participants]);
  const allFields: ScoreboardField[] = [...SCOREBOARD_FIELDS, ...extraColumns];

  function handleImageFile(file: File) {
    if (file.type !== "image/png" && file.type !== "image/jpeg") return;
    const reader = new FileReader();
    reader.onload = () => onChange({ backgroundImageDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  function toggleColumn(field: ScoreboardField, checked: boolean) {
    const next = new Set(columns);
    if (checked) next.add(field);
    else next.delete(field);
    // Giữ đúng thứ tự cố định + cột optional theo sau — đây cũng là thứ tự cột trái → phải trên bảng.
    onChange({ columns: allFields.filter((f) => next.has(f)) });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className={groupLabelClass}>Basic options</span>
        <div>
          <label className={labelClass}>Title</label>
          <input className={fieldClass} value={props.title} onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Bar color</label>
            <ColorField value={titleBarColor} onChange={(titleBarColor) => onChange({ titleBarColor })} />
          </div>
          <div>
            <label className={labelClass}>Title text color</label>
            <ColorField value={props.headerColor} onChange={(headerColor) => onChange({ headerColor })} />
          </div>
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
        </div>

        <div>
          <label className={labelClass}>Table background</label>
          <select
            className={fieldClass}
            value={backgroundType}
            onChange={(e) => onChange({ backgroundType: e.target.value as ScoreboardProps["backgroundType"] })}
          >
            <option value="none">None (Transparent)</option>
            <option value="color">Solid Color</option>
            <option value="image">Image</option>
          </select>
        </div>
        {backgroundType === "color" && (
          <div>
            <label className={labelClass}>Background color</label>
            <ColorField
              value={props.backgroundColor}
              onChange={(backgroundColor) => onChange({ backgroundColor })}
              className="h-8"
            />
          </div>
        )}
        {backgroundType === "image" && (
          <>
            <div>
              <label className={labelClass}>Image (PNG, JPG)</label>
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="text-xs text-base-300"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                }}
              />
              {props.backgroundImageDataUrl && (
                <button
                  onClick={() => onChange({ backgroundImageDataUrl: null })}
                  className="mt-1 text-left text-[11px] text-danger-500 hover:underline"
                >
                  Remove image
                </button>
              )}
            </div>
            <div>
              <label className={labelClass}>Fit</label>
              <select
                className={fieldClass}
                value={backgroundImageFit}
                onChange={(e) =>
                  onChange({ backgroundImageFit: e.target.value as ScoreboardProps["backgroundImageFit"] })
                }
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
          </>
        )}

        <div>
          <label className={labelClass}>Columns</label>
          <ColumnsDropdown
            allFields={allFields}
            selected={columns}
            onToggle={(f) => toggleColumn(f, !columns.includes(f))}
          />
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Dropdown chọn NHIỀU cột — trông như 1 <select> thường (cùng fieldClass), bấm mở ra danh sách, mỗi
// dòng có dấu tick bên cạnh nếu đang chọn; bấm 1 dòng = bật/tắt cột đó, danh sách VẪN MỞ để chọn tiếp
// nhiều cột liền. Đóng khi bấm ra ngoài hoặc Esc. <select multiple> gốc của trình duyệt không dùng
// được (hiện thành 1 listbox cố định, phải giữ Ctrl mới chọn nhiều) nên tự dựng.
function ColumnsDropdown({
  allFields,
  selected,
  onToggle,
}: {
  allFields: ScoreboardField[];
  selected: ScoreboardField[];
  onToggle: (field: ScoreboardField) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const summary =
    selected.length === 0 ? "No columns" : selected.map((f) => getScoreboardFieldLabel(f)).join(", ");

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${fieldClass} flex items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{summary}</span>
        <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-base-500" fill="currentColor">
          <path d="M4 6l4 4 4-4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded border border-base-700 bg-base-800 py-1 shadow-lg">
          {allFields.map((f) => {
            const checked = selected.includes(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => onToggle(f)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs text-base-100 hover:bg-base-700"
              >
                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${checked ? "text-gold-500" : ""}`}>
                  {checked && <CheckIcon />}
                </span>
                <span className="truncate">{getScoreboardFieldLabel(f)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
