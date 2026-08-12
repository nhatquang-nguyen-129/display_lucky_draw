import { useMemo } from "react";
import { getParticipantExtraField, LinkOpenerProps } from "@/lib/landing/types";
import { Participant } from "@/types";

interface LinkOpenerPanelProps {
  props: LinkOpenerProps;
  // Dùng để liệt kê MỌI cột optional (extra_data) đang thực sự có dữ liệu trong session này, cùng
  // cách LuckyWheelPanel.tsx làm với drawField/displayField — tránh cho chọn 1 field rỗng khiến
  // LinkOpenerView không bao giờ mở được gì.
  participants: Participant[];
  onChange: (patch: Partial<LinkOpenerProps>) => void;
}

const fieldClass =
  "w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-base-500";

const FIXED_FIELD_OPTIONS = [
  { value: "code", label: "Code" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "name", label: "Name" },
];

// Receiver thuần — cùng nguyên tắc với FireworksPanel.tsx/StageLightPanel.tsx: chỉ cấu hình bản
// thân component, không có phần trigger ở đây (wiring nằm ở Trigger Graph). Không có vị trí/kích
// thước hiện ra để chỉnh trong panel này ngoài field lấy URL — SharedFields.tsx lo phần x/y/width/
// height/tên chung như mọi component khác.
export default function LinkOpenerPanel({ props, participants, onChange }: LinkOpenerPanelProps) {
  // Mọi tên cột optional (extra_data) đang THỰC SỰ xuất hiện + có ít nhất 1 giá trị thật trong
  // session này — giống hệt cách LuckyWheelPanel.tsx liệt kê extraColumns, tránh cho chọn 1 cột
  // trống rỗng khiến LinkOpenerView không bao giờ mở được URL nào.
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

  const allOptions = [...FIXED_FIELD_OPTIONS, ...extraColumns.map((k) => ({ value: k, label: k }))];
  // Vẫn giữ field ĐANG được chọn trong danh sách dù nó không còn dữ liệu, chỉ ẩn các lựa chọn rỗng
  // KHÁC — tránh <select> hiện trắng/không khớp value nào (giống hệt LuckyWheelPanel.tsx).
  const fieldOptions = allOptions.filter((o) => o.value === props.urlField || hasDataForField(o.value));

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>URL field</label>
        <select className={fieldClass} value={props.urlField} onChange={(e) => onChange({ urlField: e.target.value })}>
          <option value="">— none selected —</option>
          {fieldOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
