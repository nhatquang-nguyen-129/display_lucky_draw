import { CATEGORY_ORDER, COMPONENT_REGISTRY, COMPONENT_TYPES } from "./componentRegistry";
import ComponentTypeIcon from "./componentIcons";
import { DRAG_MIME } from "./LandingCanvas";
import { LandingComponentType } from "@/lib/landing/types";

// Kéo 1 chip từ đây thả vào LandingCanvas để tạo component mới — dùng đúng cơ chế HTML5 DnD
// gốc (draggable + dataTransfer) đã có sẵn ở DataEditorModal cho việc kéo-thả sắp xếp cột.
// Gom nhóm theo CATEGORY_ORDER (componentRegistry.ts) — chỉ hiện icon + tên, bỏ hẳn dòng mô tả
// (đã có label rõ nghĩa + icon là đủ, mô tả dài chỉ khiến danh sách phải cuộn nhiều hơn cần thiết).
//
// Nhóm "Actions" (Draw/Confirm Winner/Link Opener...) kéo-thả GIỐNG HỆT mọi nhóm khác — không giới
// hạn số lượng (vd hoàn toàn hợp lý nếu có 2 Link Opener mở 2 URL khác nhau), vị trí thả không quan
// trọng vì chúng vô hình ở Present Mode. Tự động ẩn khỏi Canvas ngay sau khi tạo (hiddenInBuilder,
// xem handleDropNewComponent trong LandingBuilderWindow.tsx) để không chiếm chỗ/gây rối giao diện —
// vẫn chọn/cấu hình được qua LayersPanel hoặc Properties Panel tự mở ngay sau khi thả.
export default function ComponentPalette() {
  const byCategory = new Map<string, LandingComponentType[]>();
  COMPONENT_TYPES.forEach((type) => {
    const category = COMPONENT_REGISTRY[type].category;
    byCategory.set(category, [...(byCategory.get(category) ?? []), type]);
  });

  return (
    <div className="flex max-h-[70vh] w-56 flex-col gap-3 overflow-y-auto p-3">
      {CATEGORY_ORDER.map((category) => {
        const types = byCategory.get(category);
        if (!types || types.length === 0) return null;
        return (
          <div key={category} className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-base-500">{category}</span>
            {types.map((type) => {
              const entry = COMPONENT_REGISTRY[type];
              return (
                <div
                  key={type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, type)}
                  title={entry.description}
                  className="flex cursor-grab items-center gap-2 rounded-lg border border-base-700 bg-base-800 px-2.5 py-1.5 text-xs font-medium text-base-100 hover:border-gold-500/50 active:cursor-grabbing"
                >
                  <ComponentTypeIcon type={type} />
                  {entry.label}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
