import { COMPONENT_REGISTRY, COMPONENT_TYPES } from "./componentRegistry";
import { DRAG_MIME } from "./LandingCanvas";

// Kéo 1 chip từ đây thả vào LandingCanvas để tạo component mới — dùng đúng cơ chế HTML5 DnD
// gốc (draggable + dataTransfer) đã có sẵn ở DataEditorModal cho việc kéo-thả sắp xếp cột.
export default function ComponentPalette() {
  return (
    <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-3">
      <span className="text-[10px] uppercase tracking-wide text-base-500">Components</span>
      {COMPONENT_TYPES.map((type) => {
        const entry = COMPONENT_REGISTRY[type];
        return (
          <div
            key={type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, type)}
            className="cursor-grab rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 hover:border-gold-500/50 active:cursor-grabbing"
          >
            <p className="font-medium">{entry.label}</p>
            <p className="text-[11px] text-base-500">{entry.description}</p>
          </div>
        );
      })}
    </div>
  );
}
