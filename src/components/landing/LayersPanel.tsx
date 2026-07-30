import { useState } from "react";
import { LandingComponent } from "@/lib/landing/types";
import { COMPONENT_REGISTRY } from "./componentRegistry";

interface LayersPanelProps {
  components: LandingComponent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onToggleHidden: (id: string) => void;
  // orderedIds: thứ tự TRƯỚC → SAU (phần tử đầu = lớp trước cùng, đúng thứ tự hiện trên danh sách
  // sau khi kéo-thả xong) — LandingBuilderWindow.tsx tự quy đổi thành zIndex thật.
  onReorder: (orderedIds: string[]) => void;
}

function labelOf(c: LandingComponent): string {
  return c.name?.trim() || COMPONENT_REGISTRY[c.type].label;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      {hidden ? (
        <>
          <path d="M9.9 5.5A10.6 10.6 0 0 1 12 5.3c5 0 9 4 10 6.7-0.5 1.3-1.5 2.9-2.9 4.3M6.4 6.9C4.4 8.3 2.9 10.2 2 12c1 2.7 5 6.7 10 6.7 1.3 0 2.6-.3 3.7-.7" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          <path d="M2.5 2.5l19 19" />
        </>
      ) : (
        <>
          <path d="M2 12s4-6.7 10-6.7 10 6.7 10 6.7-4 6.7-10 6.7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.6" />
        </>
      )}
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <circle cx="8" cy="6" r="1.4" />
      <circle cx="16" cy="6" r="1.4" />
      <circle cx="8" cy="12" r="1.4" />
      <circle cx="16" cy="12" r="1.4" />
      <circle cx="8" cy="18" r="1.4" />
      <circle cx="16" cy="18" r="1.4" />
    </svg>
  );
}

// Danh sách layer kiểu Photoshop — 1 dòng/component, sắp theo zIndex GIẢM DẦN (đầu danh sách = lớp
// trước cùng, đúng quy ước Photoshop) — thay cho việc mỗi tính năng hide/thứ tự có 1 cách riêng như
// trước (vd Scoreboard từng có 1 checkbox ẩn riêng của chính nó, đã bỏ). Kéo-thả sắp xếp dùng đúng
// kiểu HTML5 Drag and Drop gốc đã có sẵn trong ComponentPalette.tsx, không thêm thư viện nào. Click
// vào 1 dòng gọi ĐÚNG hàm onSelect dùng chung với click trên canvas, nên hành vi
// (vd không tự mở lại Properties Panel nếu đang bị ẩn thủ công) luôn nhất quán dù chọn bằng cách nào.
export default function LayersPanel({ components, selectedId, onSelect, onToggleHidden, onReorder }: LayersPanelProps) {
  const sorted = [...components].sort((a, b) => b.zIndex - a.zIndex);
  const [dragId, setDragId] = useState<string | null>(null);

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = sorted.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    onReorder(ids);
    setDragId(null);
  }

  return (
    <div className="w-60 p-2">
      <span className="mb-1 block px-1 text-[10px] uppercase tracking-wide text-base-500">Layers</span>
      {sorted.length === 0 ? (
        <p className="px-1 py-2 text-[11px] leading-snug text-base-500">No components on this page yet.</p>
      ) : (
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {sorted.map((c) => {
            const isSelected = c.id === selectedId;
            const hidden = !!c.hiddenInBuilder;
            return (
              <div
                key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(c.id)}
                onClick={() => onSelect(c.id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${
                  isSelected
                    ? "border-gold-500 bg-gold-500/10 text-gold-300"
                    : "border-base-700 bg-base-800 text-base-100 hover:border-gold-500/40"
                }`}
              >
                <span className="shrink-0 cursor-grab text-base-500">
                  <DragHandleIcon />
                </span>
                <span className={`flex-1 truncate ${hidden ? "opacity-40" : ""}`}>{labelOf(c)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleHidden(c.id);
                  }}
                  title={hidden ? "Show in Builder" : "Hide in Builder"}
                  className="shrink-0 text-base-500 hover:text-gold-400"
                >
                  <EyeIcon hidden={hidden} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
