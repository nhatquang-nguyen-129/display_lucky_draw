import { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import { Participant } from "@/types";

export default function Participants() {
  const [items, setItems] = useState<Participant[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", phone: "", email: "" });
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const refresh = () => window.api.participants.list().then(setItems);

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd() {
    if (!form.name.trim()) return;
    await window.api.participants.create(form);
    setForm({ name: "", code: "", phone: "", email: "" });
    setShowAdd(false);
    refresh();
  }

  async function handleDelete(id: string) {
    await window.api.participants.delete(id);
    refresh();
  }

  async function handleImportFile() {
    const filePath = await window.api.dialog.openFile();
    if (!filePath) return;

    // Đọc file trực tiếp qua fetch (file://) rồi parse theo phần mở rộng
    const ext = filePath.split(".").pop()?.toLowerCase();
    const response = await fetch(`file://${filePath}`);

    let rows: any[] = [];
    if (ext === "csv") {
      const text = await response.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      rows = parsed.data as any[];
    } else {
      const buffer = await response.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
    }

    // Chuẩn hoá tên cột phổ biến (linh hoạt cho form Google Forms/Sheets xuất ra)
    const normalized = rows.map((r) => ({
      name: r.name ?? r.Name ?? r["Họ tên"] ?? r["Tên"] ?? "",
      code: r.code ?? r.Code ?? r["Mã"] ?? undefined,
      phone: r.phone ?? r.Phone ?? r["SĐT"] ?? r["Số điện thoại"] ?? undefined,
      email: r.email ?? r.Email ?? undefined,
    }));

    const inserted = await window.api.participants.bulkImport(normalized);
    setImportMsg(`Đã nhập ${inserted}/${normalized.length} người chơi từ file.`);
    refresh();
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-base-100">Người chơi</h1>
          <p className="mt-1 text-sm text-base-400">{items.length} người chơi trong hệ thống</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleImportFile}>
            Nhập file CSV/Excel
          </Button>
          <Button onClick={() => setShowAdd(true)}>+ Thêm thủ công</Button>
        </div>
      </header>

      {importMsg && (
        <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-sm text-teal-400">
          {importMsg}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-base-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-base-900 text-xs uppercase tracking-wide text-base-400">
            <tr>
              <th className="px-4 py-3 font-medium">Tên</th>
              <th className="px-4 py-3 font-medium">Mã</th>
              <th className="px-4 py-3 font-medium">SĐT</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Nguồn</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-800 bg-base-950">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-base-500">
                  Chưa có người chơi nào. Nhập file hoặc thêm thủ công để bắt đầu.
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="text-base-200">
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-base-400">{p.code ?? "—"}</td>
                  <td className="px-4 py-3 text-base-400">{p.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-base-400">{p.email ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-base-500">{p.source}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(p.id)} className="text-xs text-danger-500 hover:underline">
                      Xoá
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showAdd} title="Thêm người chơi" onClose={() => setShowAdd(false)}>
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500"
            placeholder="Họ tên *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500"
            placeholder="Mã người chơi (tuỳ chọn)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500"
            placeholder="Số điện thoại"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-base-100 outline-none focus:border-gold-500"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Button className="w-full" onClick={handleAdd}>
            Thêm người chơi
          </Button>
        </div>
      </Modal>
    </div>
  );
}
