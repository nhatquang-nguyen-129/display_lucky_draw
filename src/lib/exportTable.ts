import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "xlsx";

// Xuất 1 bảng (header + các dòng chuỗi) ra CSV hoặc XLSX — dựng nội dung ngay ở renderer bằng đúng 2
// thư viện đã dùng cho Import (Participants.tsx), main process chỉ mở hộp thoại Save + ghi file (IPC
// dialog:saveFile). Dùng chung cho Participants và Draw history ở Dashboard.
export async function exportTable(opts: {
  fileBaseName: string; // không kèm đuôi file
  sheetName: string;
  headers: string[];
  rows: string[][];
  format: ExportFormat;
}): Promise<void> {
  const defaultName = `${sanitizeFileName(opts.fileBaseName)}.${opts.format}`;
  let result: Awaited<ReturnType<typeof window.api.dialog.saveFile>>;
  if (opts.format === "csv") {
    // Kèm BOM để Excel mở đúng UTF-8 (tên tiếng Việt), không thì Excel đọc theo codepage máy → lỗi
    // font. Import tự bỏ BOM nên file xuất ra vẫn Import ngược lại được.
    const text = "﻿" + Papa.unparse({ fields: opts.headers, data: opts.rows });
    result = await window.api.dialog.saveFile({ defaultName, ext: "csv", text });
  } else {
    const sheet = XLSX.utils.aoa_to_sheet([opts.headers, ...opts.rows]);
    const workbook = XLSX.utils.book_new();
    // Tên sheet Excel tối đa 31 ký tự, không được chứa : \ / ? * [ ]
    XLSX.utils.book_append_sheet(workbook, sheet, opts.sheetName.replace(/[:\/?*[\]]/g, " ").slice(0, 31) || "Sheet1");
    const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" }) as string;
    result = await window.api.dialog.saveFile({ defaultName, ext: "xlsx", base64 });
  }
  if (result && "error" in result) alert(result.error);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\|?*\x00-\x1f]/g, "_").trim() || "export";
}

// Giờ địa phương "YYYY-MM-DD_HHMM" — gắn vào tên file mặc định để xuất nhiều lần không ghi đè nhau.
export function fileTimestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
