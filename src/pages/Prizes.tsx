import { useEffect, useState } from "react";
import Button from "@/components/Button";
import PrizeFormModal from "@/components/PrizeFormModal";
import { useSession } from "@/context/SessionContext";
import { Prize } from "@/types";

// Quantity dưới mức này thì KHÔNG bao giờ báo "Low stock" — 1/1 hay 1/2 remaining là bình thường cho 1
// giải vốn chỉ có 1-2 suất (vd Grand Prize), không phải "sắp hết" theo nghĩa cần cảnh báo; khái niệm
// "gần hết" chỉ có ý nghĩa khi quantity đủ lớn để có 1 khoảng đệm thật sự phía trên mức 0.
const LOW_STOCK_MIN_QUANTITY = 3;
// Ngưỡng % cho quantity >= LOW_STOCK_MIN_QUANTITY — vd quantity=3 → ceil(3*0.2)=1, đúng khớp remaining
// 1/3 (giải Consolation) đã nêu làm ví dụ.
const LOW_STOCK_RATIO = 0.2;

// 4 trạng thái hiện trên pill Status — ƯU TIÊN theo thứ tự viết dưới đây (chỉ 1 pill/giải):
//   1. status = "inactive" (tự tay ẩn) → xám "Hidden" — không đổi, y hệt trước đây.
//   2. quantity = 0 (CHO PHÉP setup 0 — vd giải chưa chốt số lượng thật) → xám "Unavailable", tách biệt
//      hẳn với "Out of stock" (0 vì ĐÃ hết do quay trúng) dù cùng tông xám để không lẫn với 2 trạng
//      thái CÒN mang ý nghĩa "sắp/đã hết hàng thật" bên dưới.
//   3. remaining = 0 (quantity > 0 nhưng đã trao hết) → đỏ "Out of stock".
//   4. quantity >= LOW_STOCK_MIN_QUANTITY VÀ remaining thấp (≤20% quantity) → vàng "Low stock".
//   5. còn lại (kể cả quantity nhỏ chưa hết) → xanh "Active" (giữ nguyên màu cũ).
function prizeStatusPill(p: Prize): { label: string; bg: string; text: string; dot: string } {
  if (p.status === "inactive") {
    return { label: "Hidden", bg: "bg-base-800", text: "text-base-500", dot: "bg-base-500" };
  }
  if (p.quantity === 0) {
    return { label: "Unavailable", bg: "bg-base-800", text: "text-base-500", dot: "bg-base-500" };
  }
  if (p.remaining === 0) {
    return { label: "Out of stock", bg: "bg-danger-500/10", text: "text-danger-500", dot: "bg-danger-500" };
  }
  if (p.quantity >= LOW_STOCK_MIN_QUANTITY && p.remaining <= Math.ceil(p.quantity * LOW_STOCK_RATIO)) {
    return { label: "Low stock", bg: "bg-highlight-500/10", text: "text-highlight-600", dot: "bg-highlight-500" };
  }
  return { label: "Active", bg: "bg-teal-500/10", text: "text-teal-600", dot: "bg-teal-500" };
}

type SortKey = "name" | "status" | "category" | "quantity" | "weight";

// Sort đơn giản kiểu Facebook Ads Manager — CHỈ 1 mũi tên/cột, click để chọn cột đó làm tiêu chí sort
// (mặc định A-Z/tăng dần), click LẠI đúng cột đang active để đảo chiều (Z-A/giảm dần) — không có
// dropdown/menu lựa chọn kiểu sort nào khác, chỉ đúng 1 thao tác click ở tiêu đề cột.
function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className="px-4 py-3 font-medium">
      <button type="button" onClick={() => onSort(sortKey)} className="flex items-center gap-1 hover:text-base-200">
        {label}
        {active && <span className="text-[10px]">{sort!.dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function GiftPlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 text-base-400">
      <rect x="3" y="9" width="18" height="4" rx="1" />
      <rect x="5" y="13" width="14" height="8" rx="1" />
      <path d="M12 9v12" />
      <path d="M12 9c-1.5-3-3.5-4-4.7-2.8C6 7.5 7.5 9 12 9Z" />
      <path d="M12 9c1.5-3 3.5-4 4.7-2.8C18 7.5 16.5 9 12 9Z" />
    </svg>
  );
}

// Kiểu bảng + toolbar generic (tham khảo Facebook Ads Manager) thay cho bản card cũ — mỗi dòng chỉ có
// 1 tick chọn ở đầu, CHỈ CHO CHỌN ĐÚNG 1 dòng tại 1 thời điểm (không phải multi-select thật — chọn
// dòng khác tự thay thế dòng đang chọn, xem toggleSelect) — nút Edit/Delete generic ở toolbar chung
// thao tác trên đúng 1 dòng đang chọn, thay vì mỗi dòng tự có cặp nút riêng như bản cũ.
export default function Prizes() {
  const { activeSessionId, activeSession } = useSession();
  const [items, setItems] = useState<Prize[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Prize | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = () => {
    if (activeSessionId) window.api.prizes.list(activeSessionId).then(setItems);
    else setItems([]);
  };

  useEffect(() => {
    refresh();
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  function toggleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  // Click cột CHƯA active → chọn làm tiêu chí sort, mặc định tăng dần (A-Z). Click LẠI đúng cột đang
  // active → đảo chiều — không có khái niệm "bỏ sort" (luôn có đúng 1 cột đang sort khi đã click ít
  // nhất 1 lần), khớp đúng thao tác đơn giản đã yêu cầu (chỉ click, không dropdown).
  function toggleSort(key: SortKey) {
    setSort((prev) => (!prev || prev.key !== key ? { key, dir: "asc" } : { key, dir: prev.dir === "asc" ? "desc" : "asc" }));
  }

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function openEditSelected() {
    const prize = items.find((p) => p.id === selectedId);
    if (!prize) return;
    setEditing(prize);
    setShowForm(true);
  }

  function handleSaved(message: string) {
    setToast(message);
    refresh();
  }

  async function handleDeleteSelected() {
    const prize = items.find((p) => p.id === selectedId);
    if (!prize) return;
    if (!confirm(`Delete prize "${prize.name}"? This cannot be undone.`)) return;
    await window.api.prizes.delete(prize.id);
    setSelectedId(null);
    refresh();
  }

  const totalWeight = items.reduce((s, p) => s + p.weight, 0);

  const sortedItems = [...items];
  if (sort) {
    const mul = sort.dir === "asc" ? 1 : -1;
    sortedItems.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * mul;
        case "status":
          return prizeStatusPill(a).label.localeCompare(prizeStatusPill(b).label) * mul;
        case "category":
          return (a.category ?? "").localeCompare(b.category ?? "") * mul;
        case "quantity":
          return (a.quantity - b.quantity || a.remaining - b.remaining) * mul;
        case "weight":
          return (a.weight - b.weight) * mul;
      }
    });
  }

  if (!activeSession) {
    return (
      <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
        No session open yet. Click "+ Add tab" at the top bar to create your first session.
      </p>
    );
  }

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-base-100">Prizes</h1>
          <p className="mt-1 text-sm text-base-400">
            Session "{activeSession.name}" — {items.length} prizes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openEditSelected} disabled={!selectedId}>
            Edit
          </Button>
          <Button variant="danger" onClick={handleDeleteSelected} disabled={!selectedId}>
            Delete
          </Button>
          <Button onClick={openAdd}>+ Add prize</Button>
        </div>
      </header>

      {toast && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-sm text-teal-400">
          {toast}
          <button onClick={() => setToast(null)} className="text-teal-400/70 hover:text-teal-400">
            ×
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
          No prizes yet. Click "+ Add prize" to get started.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-base-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-base-900 text-xs uppercase tracking-wide text-base-400">
              <tr>
                <th className="w-10 px-4 py-3" />
                <SortableHeader label="Prize" sortKey="name" sort={sort} onSort={toggleSort} />
                <SortableHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                <SortableHeader label="Category" sortKey="category" sort={sort} onSort={toggleSort} />
                <SortableHeader label="Quantity" sortKey="quantity" sort={sort} onSort={toggleSort} />
                <SortableHeader label="Weight" sortKey="weight" sort={sort} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-base-800 bg-base-950">
              {sortedItems.map((p) => {
                const chance = totalWeight > 0 ? ((p.weight / totalWeight) * 100).toFixed(1) : "0";
                const isInactive = p.status === "inactive";
                const isSelected = selectedId === p.id;
                const pill = prizeStatusPill(p);
                return (
                  <tr
                    key={p.id}
                    onClick={() => toggleSelect(p.id)}
                    className={`cursor-pointer ${isSelected ? "bg-gold-500/5" : "hover:bg-base-900/60"} ${isInactive ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        className="h-4 w-4 accent-gold-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-base-700 bg-base-800">
                          {p.display_image ? (
                            <img src={p.display_image} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <GiftPlaceholderIcon />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="truncate text-sm font-medium text-base-100">{p.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${pill.bg} ${pill.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-base-400">{p.category ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-base-400">
                      {p.remaining}/{p.quantity}
                    </td>
                    <td className="px-4 py-3 text-xs text-base-400">
                      <span className="font-mono">{p.weight}</span> (~
                      <span className="font-mono text-gold-500">{chance}%</span>)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PrizeFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={handleSaved}
        sessionId={activeSessionId!}
        editing={editing}
      />
    </div>
  );
}
