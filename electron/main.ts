import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "./db";
import { commitDraw, DrawCandidate, drawOne, pickWinner, resetSession } from "./drawEngine";
import { computeActiveCoreFields, resolveParticipantField } from "./participantFields";
import { APP_NAME, IS_DEV, getWindowTitle } from "./config/appConfig";

// Icon dùng lúc runtime (khác với build.icon trong package.json — đó là icon đóng gói
// vào file .app/.exe lúc build, còn icon này để BrowserWindow tự set icon cửa sổ/taskbar
// ngay cả khi chưa build). Dev đọc trực tiếp từ thư mục build/ ở gốc project; production
// đọc từ resources vì build/ không nằm trong app.asar (được copy qua extraResources).
function getIconPath(): string {
  return IS_DEV
    ? path.join(process.cwd(), "assets", "icon", "app-icon.png")
    : path.join(process.resourcesPath, "app-icon.png");
}

let mainWindow: BrowserWindow | null = null;
let presentWindow: BrowserWindow | null = null;
let hasUnsavedEditorChanges = false;

ipcMain.on("editor:dirty-changed", (_e, dirty: boolean) => {
  hasUnsavedEditorChanges = dirty;
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#FFFFFF",
    title: getWindowTitle(),
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Khoá tiêu đề cửa sổ theo config trung tâm — không cho trang web (document.title
  // từ index.html hoặc React) ghi đè lại tiêu đề đã set.
  mainWindow.on("page-title-updated", (e) => e.preventDefault());

  // Chặn đóng app đột ngột nếu Data Editor còn thay đổi chưa lưu — hỏi xác nhận trước.
  mainWindow.on("close", (e) => {
    if (!hasUnsavedEditorChanges) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: "warning",
      buttons: ["Cancel", "Close and discard changes"],
      defaultId: 0,
      cancelId: 0,
      message: "The Data Editor has unsaved changes",
      detail: "If you close the app now, unsaved changes will be lost.",
    });
    if (choice === 1) {
      hasUnsavedEditorChanges = false;
      mainWindow?.destroy();
    }
  });

  if (IS_DEV) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Cửa sổ "Present mode" riêng biệt để trình chiếu, có thể kéo sang màn hình 2
function openPresentWindow(sessionId: string) {
  if (presentWindow) {
    presentWindow.focus();
    return;
  }
  presentWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: "#FFFFFF",
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const hash = `#/present/${sessionId}`;
  if (IS_DEV) {
    presentWindow.loadURL(`http://localhost:5173/${hash}`);
  } else {
    presentWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash });
  }

  presentWindow.on("closed", () => {
    presentWindow = null;
  });
}

let landingBuilderWindow: BrowserWindow | null = null;
let hasUnsavedLandingBuilderChanges = false;

ipcMain.on("landingBuilder:dirty-changed", (_e, dirty: boolean) => {
  hasUnsavedLandingBuilderChanges = dirty;
});

// Cửa sổ phụ chứa Landing Page Builder (canvas + toolbar nổi) — tách riêng khỏi cửa sổ chính vì
// cần toàn bộ màn hình cho canvas, giống cách Present mode cũng mở cửa sổ riêng.
function openLandingBuilderWindow(sessionId: string) {
  if (landingBuilderWindow) {
    landingBuilderWindow.focus();
    return;
  }
  landingBuilderWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0B0B10",
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Chặn đóng đột ngột nếu Builder còn thay đổi chưa lưu — giống hệt guard của cửa sổ chính,
  // nhưng dùng cờ riêng vì đây là 1 cửa sổ độc lập, đóng nó không nên phụ thuộc/ảnh hưởng
  // tới trạng thái "chưa lưu" của Data Editor ở cửa sổ chính.
  landingBuilderWindow.on("close", (e) => {
    if (!hasUnsavedLandingBuilderChanges) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(landingBuilderWindow!, {
      type: "warning",
      buttons: ["Cancel", "Close and discard changes"],
      defaultId: 0,
      cancelId: 0,
      message: "The Landing Builder has unsaved changes",
      detail: "If you close this window now, unsaved changes will be lost.",
    });
    if (choice === 1) {
      hasUnsavedLandingBuilderChanges = false;
      landingBuilderWindow?.destroy();
    }
  });

  const hash = `#/landing-builder/${sessionId}`;
  if (IS_DEV) {
    landingBuilderWindow.loadURL(`http://localhost:5173/${hash}`);
  } else {
    landingBuilderWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash });
  }

  landingBuilderWindow.on("closed", () => {
    landingBuilderWindow = null;
    hasUnsavedLandingBuilderChanges = false;
  });
}

app.whenReady().then(() => {
  app.setName(APP_NAME);

  // macOS: BrowserWindow "icon" option không đổi icon Dock lúc chạy `electron .` ở dev
  // (chỉ có tác dụng khi đã đóng gói thành .app) — cần set thủ công qua app.dock.
  if (process.platform === "darwin" && IS_DEV && app.dock) {
    app.dock.setIcon(getIconPath());
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ---------------- IPC: Participants (thuộc về 1 session) ---------------- */

type ExtraData = Record<string, string>;

ipcMain.handle("participants:list", (_e, sessionId: string) => {
  return db
    .prepare(
      `SELECT * FROM participants WHERE session_id = ? AND status != 'removed' ORDER BY sort_order ASC, created_at DESC`
    )
    .all(sessionId);
});

// Đếm số liệu gốc vs hiện tại của 1 session. Xoá trong Data Editor / "Delete all" là SOFT-DELETE
// (status = 'removed'), nên hàng vẫn nằm trong DB — "original" gồm cả những dòng đã bị dedup/xoá,
// "removed" = chênh lệch do dọn dữ liệu đầu vào sai. Draw Engine đã tự lọc status = 'active' nên
// người bị 'removed' không bao giờ được quay.
ipcMain.handle("participants:stats", (_e, sessionId: string) => {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS original,
         SUM(CASE WHEN status != 'removed' THEN 1 ELSE 0 END) AS current
       FROM participants WHERE session_id = ?`
    )
    .get(sessionId) as { original: number; current: number | null };
  const current = row.current ?? 0;
  return { original: row.original, current, removed: row.original - current };
});

function nextSortOrder(sessionId: string): number {
  const row = db
    .prepare(`SELECT MAX(sort_order) as maxOrder FROM participants WHERE session_id = ?`)
    .get(sessionId) as { maxOrder: number | null };
  return (row.maxOrder ?? -1) + 1;
}

ipcMain.handle(
  "participants:create",
  (
    _e,
    data: { sessionId: string; name: string; code?: string; phone?: string; email?: string; extra?: ExtraData }
  ) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO participants (id, session_id, name, code, phone, email, extra_data, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.sessionId,
      data.name,
      data.code ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.extra && Object.keys(data.extra).length ? JSON.stringify(data.extra) : null,
      nextSortOrder(data.sessionId)
    );
    return id;
  }
);

ipcMain.handle(
  "participants:update",
  (
    _e,
    data: {
      id: string;
      name: string;
      code?: string | null;
      phone?: string | null;
      email?: string | null;
      extra?: ExtraData;
    }
  ) => {
    db.prepare(
      `UPDATE participants SET name = ?, code = ?, phone = ?, email = ?, extra_data = ? WHERE id = ?`
    ).run(
      data.name,
      data.code ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.extra && Object.keys(data.extra).length ? JSON.stringify(data.extra) : null,
      data.id
    );
  }
);

ipcMain.handle(
  "participants:bulkImport",
  (
    _e,
    sessionId: string,
    rows: Array<{ name: string; code?: string; phone?: string; email?: string; extra?: ExtraData }>
  ) => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO participants (id, session_id, name, code, phone, email, extra_data, sort_order, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import')`
    );
    const tx = db.transaction((items: typeof rows) => {
      let inserted = 0;
      let nextOrder = nextSortOrder(sessionId);
      for (const row of items) {
        // Import không đoán cột name/phone/... nữa (gán nhãn làm sau, thủ công, trong Data
        // Editor) — name có thể rỗng ở bước này. Chỉ bỏ qua dòng KHÔNG có bất kỳ dữ liệu nào.
        const hasAnyData =
          row.name || row.code || row.phone || row.email || (row.extra && Object.keys(row.extra).length > 0);
        if (!hasAnyData) continue;
        const result = insert.run(
          randomUUID(),
          sessionId,
          row.name,
          row.code ?? null,
          row.phone ?? null,
          row.email ?? null,
          row.extra && Object.keys(row.extra).length ? JSON.stringify(row.extra) : null,
          nextOrder
        );
        if (result.changes > 0) {
          inserted++;
          nextOrder++;
        }
      }
      return inserted;
    });
    return tx(rows);
  }
);

// Soft-delete: giữ hàng lại để đối chiếu với số liệu gốc (xem participants:stats). Draw Engine lọc
// status = 'active' nên hàng 'removed' tự động không vào vòng quay; participants:list cũng ẩn nó đi.
ipcMain.handle("participants:delete", (_e, id: string) => {
  db.prepare(`UPDATE participants SET status = 'removed' WHERE id = ?`).run(id);
});

ipcMain.handle("participants:bulkDelete", (_e, ids: string[]) => {
  const del = db.prepare(`UPDATE participants SET status = 'removed' WHERE id = ? AND status != 'removed'`);
  const tx = db.transaction((items: string[]) => {
    let deleted = 0;
    for (const id of items) deleted += del.run(id).changes;
    return deleted;
  });
  return tx(ids);
});

// Ghi lại thứ tự dòng sau khi kéo-thả sắp xếp trong Data Editor — orderedIds đã đúng thứ tự mong muốn.
ipcMain.handle("participants:reorder", (_e, orderedIds: string[]) => {
  const update = db.prepare(`UPDATE participants SET sort_order = ? WHERE id = ?`);
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, index) => update.run(index, id));
  });
  tx(orderedIds);
});

/* ---------------- IPC: Prizes (thuộc về 1 session) ---------------- */

ipcMain.handle("prizes:list", (_e, sessionId: string) => {
  return db.prepare(`SELECT * FROM prizes WHERE session_id = ? ORDER BY created_at DESC`).all(sessionId);
});

interface PrizeInput {
  sessionId: string;
  code?: string;
  name: string;
  category?: string;
  status?: string;
  quantity: number;
  weight: number;
  allowDuplicateWithOtherPrizes?: boolean;
  allowDuplicateWithSamePrize?: boolean;
  maxWinCount?: number;
  displayImage?: string | null; // base64 data URL (PNG)
}

ipcMain.handle("prizes:create", (_e, data: PrizeInput) => {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO prizes (
      id, session_id, code, name, category, status, quantity, remaining, weight,
      allow_duplicate_with_other_prizes, allow_duplicate_with_same_prize, max_win_count, display_image
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.sessionId,
    data.code ?? null,
    data.name,
    data.category ?? null,
    data.status ?? "active",
    data.quantity,
    data.quantity, // remaining = quantity lúc mới tạo
    data.weight,
    data.allowDuplicateWithOtherPrizes ?? true ? 1 : 0,
    data.allowDuplicateWithSamePrize ? 1 : 0,
    data.maxWinCount ?? 1,
    data.displayImage ?? null
  );
  return id;
});

ipcMain.handle("prizes:update", (_e, data: PrizeInput & { id: string }) => {
  const existing = db.prepare(`SELECT quantity, remaining FROM prizes WHERE id = ?`).get(data.id) as
    | { quantity: number; remaining: number }
    | undefined;
  if (!existing) return;

  // Nếu sửa số lượng, cộng/trừ đúng phần chênh lệch vào remaining thay vì reset —
  // giữ nguyên số lượt đã trao trước đó (không cho remaining âm).
  const delta = data.quantity - existing.quantity;
  const newRemaining = Math.max(0, existing.remaining + delta);

  db.prepare(
    `UPDATE prizes SET
      code = ?, name = ?, category = ?, status = ?, quantity = ?, remaining = ?, weight = ?,
      allow_duplicate_with_other_prizes = ?, allow_duplicate_with_same_prize = ?, max_win_count = ?, display_image = ?
    WHERE id = ?`
  ).run(
    data.code ?? null,
    data.name,
    data.category ?? null,
    data.status ?? "active",
    data.quantity,
    newRemaining,
    data.weight,
    data.allowDuplicateWithOtherPrizes ?? true ? 1 : 0,
    data.allowDuplicateWithSamePrize ? 1 : 0,
    data.maxWinCount ?? 1,
    data.displayImage ?? null,
    data.id
  );
});

ipcMain.handle("prizes:delete", (_e, id: string) => {
  db.prepare(`DELETE FROM prizes WHERE id = ?`).run(id);
});

/* ---------------- IPC: Sessions (= tab, đơn vị chứa 1 sự kiện quay số độc lập) ---------------- */

ipcMain.handle("sessions:list", () => {
  return db.prepare(`SELECT * FROM sessions ORDER BY created_at ASC`).all();
});

// Lấy 1 session theo id — cần riêng vì PresentMode chạy trong BrowserWindow/route tách biệt,
// không có SessionProvider nên không thể lấy activeSession qua context như các trang chính.
ipcMain.handle("sessions:get", (_e, id: string) => {
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) ?? null;
});

ipcMain.handle(
  "sessions:create",
  (_e, data: { name: string; allowDuplicatePrize?: boolean; excludePreviousWinners?: boolean }) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO sessions (id, name, allow_duplicate_prize, exclude_previous_winners, status)
       VALUES (?, ?, ?, ?, 'draft')`
    ).run(id, data.name, data.allowDuplicatePrize ? 1 : 0, data.excludePreviousWinners === false ? 0 : 1);
    return id;
  }
);

ipcMain.handle("sessions:rename", (_e, data: { id: string; name: string }) => {
  db.prepare(`UPDATE sessions SET name = ? WHERE id = ?`).run(data.name, data.id);
});

ipcMain.handle(
  "sessions:updateOptions",
  (_e, data: { id: string; allowDuplicatePrize: boolean; excludePreviousWinners: boolean }) => {
    db.prepare(`UPDATE sessions SET allow_duplicate_prize = ?, exclude_previous_winners = ? WHERE id = ?`).run(
      data.allowDuplicatePrize ? 1 : 0,
      data.excludePreviousWinners ? 1 : 0,
      data.id
    );
  }
);

// Lưu mapping "cột nào thuộc loại dữ liệu chuẩn hoá nào" — gọi ngay khi người dùng đổi
// trong Data Editor (không gộp vào nút Save chính, vì đây là metadata không phải data dòng).
ipcMain.handle(
  "sessions:updateColumnTypes",
  (_e, data: { id: string; columnTypes: Record<string, string> }) => {
    db.prepare(`UPDATE sessions SET participant_column_types = ? WHERE id = ?`).run(
      JSON.stringify(data.columnTypes),
      data.id
    );
  }
);

// Lưu nhãn hiển thị tùy biến của cột trong Data Editor ({ [tênCột]: "Nhãn" }). Cột lõi chỉ đổi nhãn,
// dữ liệu vẫn ở cột SQL name/phone/code/email.
ipcMain.handle(
  "sessions:updateColumnLabels",
  (_e, data: { id: string; columnLabels: Record<string, string> }) => {
    db.prepare(`UPDATE sessions SET participant_column_labels = ? WHERE id = ?`).run(
      JSON.stringify(data.columnLabels),
      data.id
    );
  }
);

// Lưu layout Landing Page Builder — Builder chỉ sửa JSON này, PresentMode chỉ render nó.
ipcMain.handle(
  "sessions:updateLandingConfig",
  (_e, data: { id: string; landingConfig: unknown }) => {
    db.prepare(`UPDATE sessions SET landing_config = ? WHERE id = ?`).run(
      JSON.stringify(data.landingConfig),
      data.id
    );
  }
);

// Xoá tab: xoá luôn toàn bộ participants/prizes/kết quả quay thuộc riêng session đó
// (an toàn vì dữ liệu này KHÔNG được chia sẻ với session khác trong mô hình mới)
ipcMain.handle("sessions:delete", (_e, id: string) => {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM draw_results WHERE session_id = ?`).run(id);
    db.prepare(`DELETE FROM participants WHERE session_id = ?`).run(id);
    db.prepare(`DELETE FROM prizes WHERE session_id = ?`).run(id);
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  });
  tx();
});

ipcMain.handle("sessions:results", (_e, sessionId: string) => {
  const rows = db
    .prepare(
      `SELECT dr.*,
              p.name as participant_name, p.code as participant_code, p.phone as participant_phone,
              p.email as participant_email, p.extra_data as participant_extra_data,
              pr.name as prize_name, pr.code as prize_code, pr.display_image as prize_display_image
       FROM draw_results dr
       JOIN participants p ON p.id = dr.participant_id
       JOIN prizes pr ON pr.id = dr.prize_id
       WHERE dr.session_id = ?
       ORDER BY dr.drawn_at DESC`
    )
    .all(sessionId) as any[];

  // Kết quả hiển thị (Winner Name/Scoreboard) đọc theo cột nào đang được Data Editor gán Data Type
  // Name/Phone/Code/Email cho session này — KHÔNG đọc cứng p.name/.phone/... (xem
  // docs/architecture/draw-engine.md). participant_extra_data chỉ dùng để resolve ở đây, không trả
  // ra ngoài (giữ đúng shape DrawResultRow cũ, tránh renderer phải đổi theo).
  const session = db.prepare(`SELECT participant_column_types FROM sessions WHERE id = ?`).get(sessionId) as
    | { participant_column_types: string | null }
    | undefined;
  const allParticipants = db
    .prepare(`SELECT name, phone, code, email, extra_data FROM participants WHERE session_id = ?`)
    .all(sessionId) as { name: string; phone: string | null; code: string | null; email: string | null; extra_data: string | null }[];
  const activeCoreFields = computeActiveCoreFields(allParticipants);
  const columnTypesJson = session?.participant_column_types ?? null;

  return rows.map((r) => {
    const participant = {
      name: r.participant_name,
      phone: r.participant_phone,
      code: r.participant_code,
      email: r.participant_email,
      extra_data: r.participant_extra_data,
    };
    const { participant_extra_data, ...rest } = r;
    return {
      ...rest,
      participant_name: resolveParticipantField(participant, columnTypesJson, "name", activeCoreFields) || r.participant_name,
      participant_phone: resolveParticipantField(participant, columnTypesJson, "phone", activeCoreFields) || r.participant_phone,
      participant_code: resolveParticipantField(participant, columnTypesJson, "code", activeCoreFields) || r.participant_code,
      participant_email: resolveParticipantField(participant, columnTypesJson, "email", activeCoreFields) || r.participant_email,
    };
  });
});

ipcMain.handle("draw:one", (_e, sessionId: string) => {
  return drawOne({ sessionId });
});

// Chọn ứng viên nhưng CHƯA ghi DB — dùng cho Button "Draw" trên Landing Page, cần xem trước
// trước khi Confirm/Redo (xem drawEngine.ts:pickWinner).
ipcMain.handle(
  "draw:pick",
  (_e, data: { sessionId: string; excludeParticipantIds?: string[]; lockedPrizeId?: string }) => {
    return pickWinner(data);
  }
);

// Ghi nhận chính thức 1 candidate đã pick — dùng cho Button "Confirm" trên Landing Page.
ipcMain.handle("draw:commit", (_e, data: { candidate: DrawCandidate; sessionId: string }) => {
  commitDraw(data.candidate, data.sessionId);
});

// Xoá hết draw_results + trả remaining mọi prize về quantity gốc — dùng cho Button "Reset Session"
// trên Landing Page. Không đụng participants/prizes/session (khác sessions:delete).
ipcMain.handle("draw:resetSession", (_e, sessionId: string) => {
  resetSession(sessionId);
});

ipcMain.handle("present:open", (_e, sessionId: string) => {
  openPresentWindow(sessionId);
});

ipcMain.handle("landingBuilder:open", (_e, sessionId: string) => {
  openLandingBuilderWindow(sessionId);
});

// Button action "openLink" trên Landing Page — luôn mở bằng trình duyệt mặc định của hệ điều hành
// (shell.openExternal), không phải cửa sổ trong app. Chỉ nhận http/https — URL trong extra_data
// là dữ liệu do người tổ chức tự nhập vào danh sách participant, nhưng vẫn chặn scheme lạ
// (file://, custom scheme...) để tránh mở nhầm thứ ngoài ý muốn.
ipcMain.handle("shell:openExternal", (_e, url: string) => {
  if (!/^https?:\/\//i.test(url)) return;
  shell.openExternal(url);
});

import fs from "fs";

ipcMain.handle("dialog:openAndReadFile", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Data files", extensions: ["csv", "xlsx", "xls"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  // Dialog filter chỉ giới hạn hiển thị — vẫn có thể bị lách (gõ thẳng tên file, một số Linux
  // file manager không tôn trọng filter), nên chặn lại tường minh ở đây trước khi đọc/parse.
  if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
    return { ext, error: `Unsupported file type ".${ext}". Only .csv, .xlsx and .xls files are supported.` };
  }

  if (ext === "csv") {
    const text = fs.readFileSync(filePath, "utf-8");
    return { ext, text };
  }
  const buffer = fs.readFileSync(filePath);
  return { ext, base64: buffer.toString("base64") };
});
