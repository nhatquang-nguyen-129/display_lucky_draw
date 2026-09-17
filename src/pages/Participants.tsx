import { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import Button from "@/components/Button";
import DataEditorModal from "@/components/DataEditorModal";
import { useSession } from "@/context/SessionContext";
import { Participant } from "@/types";
import { computeActiveParticipantCoreFields, getParticipantField } from "@/lib/landing/types";

const CORE_COLUMN_LABELS: Record<string, string> = { name: "Name", phone: "Phone", code: "Code", email: "Email" };

export default function Participants() {
  const { activeSessionId, activeSession } = useSession();
  const [items, setItems] = useState<Participant[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Preview RAW, giống hệt cột đang hiện trong Data Editor trước khi gán nhãn — không còn ép cứng 4
  // cột Name/Code/Phone/Email (import generic để trống chúng cho tới khi được gán Data Type, xem
  // docs/participants/column-mapping.md). Core field chỉ hiện nếu đang có dữ liệu thật (dữ liệu cũ
  // trước khi đổi thiết kế); phần còn lại lấy nguyên tên cột trong extra_data, đúng thứ tự xuất hiện.
  const activeCoreFields = Array.from(computeActiveParticipantCoreFields(items));
  const extraColumns: string[] = [];
  const seenExtra = new Set<string>();
  items.forEach((p) => {
    if (!p.extra_data) return;
    try {
      Object.keys(JSON.parse(p.extra_data) as Record<string, string>).forEach((k) => {
        if (!seenExtra.has(k)) {
          seenExtra.add(k);
          extraColumns.push(k);
        }
      });
    } catch {
      /* ignore */
    }
  });
  const previewColumns = [...activeCoreFields, ...extraColumns];

  const refresh = () => {
    if (activeSessionId) window.api.participants.list(activeSessionId).then(setItems);
    else setItems([]);
  };

  useEffect(() => {
    refresh();
    setImportError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  async function handleImportFile() {
    if (!activeSessionId) return;
    const result = await window.api.dialog.openAndReadFile();
    if (!result) return;
    if (result.error) {
      setImportError(result.error);
      return;
    }
    setImportError(null);

    let rows: any[] = [];
    if (result.ext === "csv") {
      // Excel xuất CSV UTF-8 thường kèm BOM ở đầu file, khiến header cột đầu tiên
      // bị dính ﻿ nếu không bỏ trước khi parse.
      const text = result.text!.replace(/^﻿/, "");
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      rows = parsed.data as any[];
    } else {
      const binary = atob(result.base64!);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const workbook = XLSX.read(bytes, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
    }

    // Import KHÔNG đoán cột nào là tên/sđt/email — mọi cột trong file vào thẳng extra_data y
    // nguyên tên gốc. Việc gán cột nào đóng vai trò Name/Phone/Code/Email là thao tác thủ công của
    // người dùng, làm SAU khi đã import xong, qua dropdown "Data type" trên header cột trong Data
    // Editor (xem docs/participants/column-mapping.md). Chỉ bỏ qua dòng trắng hoàn toàn (mọi cột đều rỗng).
    const normalized = rows
      .map((r) => {
        const extra: Record<string, string> = {};
        Object.keys(r).forEach((key) => {
          const value = r[key];
          if (value !== undefined && value !== null && String(value).trim() !== "") {
            extra[key.trim()] = String(value).trim();
          }
        });
        return { name: "", extra: Object.keys(extra).length ? extra : undefined };
      })
      .filter((r) => r.extra);

    // Đã có sẵn dữ liệu (nút hiện là "Replace" thay vì "Import", xem header bên dưới) — file mới
    // XOÁ HẲN dữ liệu cũ rồi mới nạp, không cộng dồn. Hỏi xác nhận SAU KHI đã chọn xong file (không
    // hỏi trước khi mở dialog) — huỷ dialog chọn file thì không cần hỏi gì cả; từ chối xác nhận thì
    // giữ nguyên dữ liệu cũ, không xoá gì.
    if (items.length > 0) {
      if (
        !confirm(
          `Replace all ${items.length} existing participants in session "${activeSession?.name}" with ${normalized.length} rows from this file? This cannot be undone.`
        )
      )
        return;
      await window.api.participants.bulkDelete(items.map((p) => p.id));
    }

    await window.api.participants.bulkImport(activeSessionId, normalized);
    setImportError(null);
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
    <div className="flex h-full flex-col">
      <header className="mb-6 flex flex-shrink-0 items-center justify-between">
        <p className="text-sm text-base-400">
          {items.length} participants in session "{activeSession.name}"
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowEditor(true)}>
            Edit
          </Button>
          <Button variant="secondary" onClick={handleImportFile}>
            {items.length === 0 ? "Import" : "Replace"}
          </Button>
          <Button variant="danger" onClick={handleClearAll} disabled={items.length === 0}>
            Delete
          </Button>
        </div>
      </header>

      {importError && (
        <div className="mb-4 flex-shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {importError}
        </div>
      )}

      {/* Bảng preview — chỉ để xem nhanh, không có thao tác sửa/xoá từng dòng. Cột hiện RAW y hệt
          Data Editor (không ép cứng Name/Code/Phone/Email) — overflow-auto (dọc lẫn ngang) vì file
          import có thể có rất nhiều cột (vd Google Form) và nhiều dòng; đây là vùng scroll DUY NHẤT
          của trang, phần header phía trên (Data Editor/Import/Delete all) đứng yên (xem Layout.tsx,
          isFullHeight). Mọi chỉnh sửa (kể cả thêm thủ công, gán Data Type) đều thực hiện trong Data
          Editor để tránh 2 nơi thao tác cùng dữ liệu. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-base-800">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-base-900 text-xs uppercase tracking-wide text-base-400">
            <tr>
              {previewColumns.map((col) => (
                <th key={col} className="whitespace-nowrap px-4 py-3 font-medium">
                  {CORE_COLUMN_LABELS[col] ?? col}
                </th>
              ))}
              <th className="whitespace-nowrap px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-800 bg-base-950">
            {items.length === 0 ? (
              <tr>
                <td colSpan={previewColumns.length + 1} className="px-4 py-8 text-center text-base-500">
                  No participants yet. Import a file to get started, or open the Data Editor to add manually.
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="text-base-200">
                  {previewColumns.map((col) => (
                    <td key={col} className="whitespace-nowrap px-4 py-3 text-base-400">
                      {getParticipantField(p, col) || "—"}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-base-500">{p.source}</td>
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
