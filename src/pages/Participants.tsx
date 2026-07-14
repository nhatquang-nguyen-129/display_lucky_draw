import { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import DataEditorModal from "@/components/DataEditorModal";
import { useSession } from "@/context/SessionContext";
import { Participant } from "@/types";

export default function Participants() {
  const { activeSessionId, activeSession } = useSession();
  const [items, setItems] = useState<Participant[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", phone: "", email: "" });
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const refresh = () => {
    if (activeSessionId) window.api.participants.list(activeSessionId).then(setItems);
    else setItems([]);
  };

  useEffect(() => {
    refresh();
    setImportMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  async function handleAdd() {
    if (!form.name.trim() || !activeSessionId) return;
    await window.api.participants.create({ ...form, sessionId: activeSessionId });
    setForm({ name: "", code: "", phone: "", email: "" });
    setShowAdd(false);
    refresh();
  }

  async function handleDelete(id: string) {
    await window.api.participants.delete(id);
    refresh();
  }

  async function handleImportFile() {
    if (!activeSessionId) return;
    const result = await window.api.dialog.openAndReadFile();
    if (!result) return;

    let rows: any[] = [];
    if (result.ext === "csv") {
      const parsed = Papa.parse(result.text!, { header: true, skipEmptyLines: true });
      rows = parsed.data as any[];
    } else {
      const binary = atob(result.base64!);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const workbook = XLSX.read(bytes, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
    }

    // Danh sách tên cột đã được xử lý thành field chuẩn — mọi cột KHÔNG nằm trong đây
    // sẽ tự động gom vào extra_data (không bị mất, hiển thị được ở Data Editor).
    const CORE_KEYS = new Set([
      "name", "Name", "Họ tên", "Tên", "full_name",
      "code", "Code", "Mã",
      "phone", "Phone", "SĐT", "Số điện thoại", "phone_number",
      "email", "Email",
    ]);

    const normalized = rows.map((r) => {
      const name = r.name ?? r.Name ?? r.full_name ?? r["Họ tên"] ?? r["Tên"] ?? "";
      const code = r.code ?? r.Code ?? r["Mã"] ?? undefined;
      const phone = r.phone ?? r.Phone ?? r.phone_number ?? r["SĐT"] ?? r["Số điện thoại"] ?? undefined;
      const email = r.email ?? r.Email ?? undefined;

      const extra: Record<string, string> = {};
      Object.keys(r).forEach((key) => {
        if (CORE_KEYS.has(key)) return;
        const value = r[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          extra[key] = String(value);
        }
      });

      return { name, code, phone, email, extra: Object.keys(extra).length ? extra : undefined };
    });

    const inserted = await window.api.participants.bulkImport(activeSessionId, normalized);
    setImportMsg(`Đã nhập ${inserted}/${normalized.length} người chơi từ file.`);
    refresh();
  }

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
          <h1 className="font-display text-2xl font-medium text-base-100">Người chơi</h1>
          <p className="mt-1 text-sm text-base-400">
            {items.length} người chơi trong phiên "{activeSession.name}"
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowEditor(true)}>
            Data Editor
          </Button>
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

      <DataEditorModal
        open={showEditor}
        sessionId={activeSessionId!}
        onClose={() => setShowEditor(false)}
        onSaved={refresh}
      />
    </div>
  );
}
