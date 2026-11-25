import { useEffect, useMemo, useRef, useState } from "react";
import { Session } from "@/types";
import { fullyLocked, inputsLocked } from "@/lib/sessionLock";

// Nút ⌄ cuối hàng tab (giống nút tìm tab của Chrome): bấm ra danh sách MỌI tab đang mở, có ô tìm theo tên,
// để nhảy thẳng tới tab bị khuất khi hàng tab tràn ngang. Chỉ liệt kê tab đang mở (không gồm tab đã Close —
// mở lại tab đã Close dùng nút Open). Esc hoặc bấm ra ngoài để đóng; ↑/↓ + Enter chọn bằng bàn phím.
export default function TabListMenu({
  sessions,
  activeSessionId,
  onSelect,
}: {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sessions.filter((s) => s.name.toLowerCase().includes(q)) : sessions;
  }, [sessions, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    setOpen((v) => !v);
    setQuery("");
    setHighlight(Math.max(0, sessions.findIndex((s) => s.id === activeSessionId)));
  }

  function choose(id: string) {
    onSelect(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter" && filtered[highlight]) choose(filtered[highlight].id);
  }

  return (
    <div ref={rootRef} className="relative mb-1 shrink-0">
      <button
        onClick={toggle}
        title="List all open tabs"
        className={`flex h-7 w-7 items-center justify-center rounded-md text-base-400 hover:bg-base-800 hover:text-base-100 ${open ? "bg-base-800 text-base-100" : ""}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-base-800 bg-base-950 p-2 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search tabs..."
            className="mb-1.5 w-full rounded-md border border-base-700 bg-base-950 px-2.5 py-1.5 text-sm text-base-100 outline-none placeholder:text-base-500 focus:border-gold-500"
          />
          <div className="max-h-80 overflow-y-auto">
            {filtered.map((s, i) => {
              const active = s.id === activeSessionId;
              return (
                <button
                  key={s.id}
                  onClick={() => choose(s.id)}
                  onMouseEnter={() => setHighlight(i)}
                  title={s.name}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                    i === highlight ? "bg-base-800" : ""
                  } ${active ? "font-medium text-gold-500" : "text-base-300"}`}
                >
                  {inputsLocked(s) ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className={`h-3.5 w-3.5 shrink-0 ${fullyLocked(s) ? "text-base-400" : "text-teal-500"}`}
                    >
                      <rect x="5" y="11" width="14" height="9" rx="1.5" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {active && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 shrink-0">
                      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="px-2.5 py-3 text-center text-xs text-base-500">No matching tabs.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
