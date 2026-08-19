import { useMemo, useState } from "react";
import { getScoreboardFieldLabel, SCOREBOARD_FIELDS, ScoreboardField, ScoreboardProps } from "@/lib/landing/types";
import { Participant } from "@/types";

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
const sectionClass = "text-[10px] uppercase tracking-wide text-base-500";

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

export default function ScoreboardPanel({ props, participants, onChange }: ScoreboardPanelProps) {
  const { titleBarColor, columns, backgroundType, backgroundImageFit } = normalizeProps(props);
  const [columnsOpen, setColumnsOpen] = useState(false);

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
    <div className="space-y-3">
      <span className={sectionClass}>Name bar</span>
      <div>
        <label className={labelClass}>Title</label>
        <input className={fieldClass} value={props.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Bar color</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={titleBarColor}
            onChange={(e) => onChange({ titleBarColor: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Title text color</label>
          <input
            type="color"
            className="h-[26px] w-full rounded border border-base-700 bg-base-800"
            value={props.headerColor}
            onChange={(e) => onChange({ headerColor: e.target.value })}
          />
        </div>
      </div>

      <div className="h-px bg-base-800" />
      <details
        open={columnsOpen}
        onToggle={(e) => setColumnsOpen(e.currentTarget.open)}
        className="rounded-lg border border-base-800"
      >
        <summary className="cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-base-100">
          Columns ({columns.length} selected)
        </summary>
        <div className="max-h-48 space-y-1 overflow-y-auto border-t border-base-800 px-2.5 py-2">
          {allFields.map((f) => (
            <label key={f} className="flex items-center gap-1.5 text-xs text-base-200">
              <input
                type="checkbox"
                checked={columns.includes(f)}
                onChange={(e) => toggleColumn(f, e.target.checked)}
                className="accent-gold-500"
              />
              {getScoreboardFieldLabel(f)}
            </label>
          ))}
        </div>
      </details>
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
      </div>

      <div className="h-px bg-base-800" />
      <span className={sectionClass}>Table background</span>
      <div>
        <label className={labelClass}>Type</label>
        <select
          className={fieldClass}
          value={backgroundType}
          onChange={(e) => onChange({ backgroundType: e.target.value as ScoreboardProps["backgroundType"] })}
        >
          <option value="none">None (transparent)</option>
          <option value="color">Solid color</option>
          <option value="image">Image</option>
        </select>
      </div>
      {backgroundType === "color" && (
        <div>
          <label className={labelClass}>Background color</label>
          <input
            type="color"
            className="h-8 w-full rounded border border-base-700 bg-base-800"
            value={props.backgroundColor}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
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
    </div>
  );
}
