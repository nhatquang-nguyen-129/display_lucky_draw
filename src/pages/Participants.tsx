import { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import Button from "@/components/Button";
import DataEditorModal from "@/components/DataEditorModal";
import { useSession } from "@/context/SessionContext";
import { Participant } from "@/types";

export default function Participants() {
  const { activeSessionId, activeSession } = useSession();
  const [items, setItems] = useState<Participant[]>([]);
  const [showEditor, setShowEditor] = useState(false);
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
    setImportMsg(`Imported ${inserted}/${normalized.length} participants from the file.`);
    refresh();
  }

  async function handleClearAll() {
    if (items.length === 0) return;
    if (
      !confirm(
        `Delete all ${items.length} participants in session "${activeSession?.name}"? This cannot be undone — use this when you want to re-import a fresh file.`
      )
    )
      return;
    await window.api.participants.bulkDelete(items.map((p) => p.id));
    setImportMsg(null);
    refresh();
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
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-base-100">Participants</h1>
          <p className="mt-1 text-sm text-base-400">
            {items.length} participants in session "{activeSession.name}" — quick view here, all edits happen in
            the Data Editor.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowEditor(true)}>
            Data Editor
          </Button>
          <Button variant="secondary" onClick={handleImportFile}>
            Import CSV/Excel file
          </Button>
          <Button variant="danger" onClick={handleClearAll} disabled={items.length === 0}>
            Delete all
          </Button>
        </div>
      </header>

      {importMsg && (
        <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-sm text-teal-400">
          {importMsg}
        </div>
      )}

      {/* Bảng preview — chỉ để xem nhanh, không có thao tác sửa/xoá từng dòng.
          Mọi chỉnh sửa (kể cả thêm thủ công) đều thực hiện trong Data Editor để tránh 2 nơi thao tác cùng dữ liệu. */}
      <div className="overflow-hidden rounded-xl border border-base-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-base-900 text-xs uppercase tracking-wide text-base-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-800 bg-base-950">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-base-500">
                  No participants yet. Import a file to get started, or open the Data Editor to add manually.
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DataEditorModal
        open={showEditor}
        sessionId={activeSessionId!}
        session={activeSession}
        onClose={() => setShowEditor(false)}
        onSaved={refresh}
      />
    </div>
  );
}
