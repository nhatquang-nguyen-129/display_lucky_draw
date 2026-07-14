import { useEffect, useState } from "react";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import { useSession } from "@/context/SessionContext";
import { Prize } from "@/types";

export default function Prizes() {
  const { activeSessionId, activeSession } = useSession();
  const [items, setItems] = useState<Prize[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", quantity: 1, weight: 1 });

  const refresh = () => {
    if (activeSessionId) window.api.prizes.list(activeSessionId).then(setItems);
    else setItems([]);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  async function handleAdd() {
    if (!form.name.trim() || !activeSessionId) return;
    await window.api.prizes.create({ ...form, sessionId: activeSessionId });
    setForm({ name: "", quantity: 1, weight: 1 });
    setShowAdd(false);
    refresh();
  }

  async function handleDelete(id: string) {
    await window.api.prizes.delete(id);
    refresh();
  }

  const totalWeight = items.reduce((s, p) => s + p.weight, 0);

  if (!activeSession) {
    return (
      <p className="rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
        Chưa có phiên nào đang mở. Bấm "+ Thêm tab" ở thanh trên cùng để tạo phiên đầu tiên.
      </p>
    );
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-base-100">Giải thưởng</h1>
          <p className="mt-1 text-sm text-base-400">
            Phiên "{activeSession.name}" — trọng số quyết định tỷ lệ trúng, giải trọng số càng thấp thì càng hiếm.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>+ Thêm giải</Button>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-base-800 px-4 py-10 text-center text-sm text-base-500">
            Chưa có giải thưởng nào. Thêm giải đầu tiên để bắt đầu cấu hình quay số.
          </p>
        )}
        {items.map((p) => {
          const chance = totalWeight > 0 ? ((p.weight / totalWeight) * 100).toFixed(1) : "0";
          return (
            <div key={p.id} className="rounded-xl border border-base-800 bg-base-900 p-5">
              <div className="mb-3 flex items-start justify-between">
                <h3 className="font-display text-base font-medium text-base-100">{p.name}</h3>
                <button onClick={() => handleDelete(p.id)} className="text-xs text-danger-500 hover:underline">
                  Xoá
                </button>
              </div>
              <div className="space-y-1.5 text-sm text-base-400">
                <div className="flex justify-between">
                  <span>Số lượng còn lại</span>
                  <span className="font-mono text-base-200">
                    {p.remaining}/{p.quantity}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Trọng số</span>
                  <span className="font-mono text-base-200">{p.weight}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tỷ lệ ước tính</span>
                  <span className="font-mono text-gold-400">{chance}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={showAdd} title="Thêm giải thưởng" onClose={() => setShowAdd(false)}>
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500"
            placeholder="Tên giải *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-base-400">Số lượng</label>
              <input
                type="number"
                min={1}
                className="w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-base-400">Trọng số (tỷ lệ)</label>
              <input
                type="number"
                min={0.01}
                step={0.1}
                className="w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
              />
            </div>
          </div>
          <p className="text-xs text-base-500">
            Ví dụ: giải Đặc biệt weight 1, giải Khuyến khích weight 10 → giải khuyến khích ra nhiều hơn 10 lần.
          </p>
          <Button className="w-full" onClick={handleAdd}>
            Thêm giải thưởng
          </Button>
        </div>
      </Modal>
    </div>
  );
}
