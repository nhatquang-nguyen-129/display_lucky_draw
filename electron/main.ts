import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "./db";
import { drawOne } from "./drawEngine";
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
      buttons: ["Huỷ", "Đóng và bỏ qua thay đổi"],
      defaultId: 0,
      cancelId: 0,
      message: "Data Editor còn thay đổi chưa lưu",
      detail: "Nếu đóng ứng dụng bây giờ, các thay đổi chưa lưu sẽ bị mất.",
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
    .prepare(`SELECT * FROM participants WHERE session_id = ? ORDER BY sort_order ASC, created_at DESC`)
    .all(sessionId);
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
        if (!row.name) continue;
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

ipcMain.handle("participants:delete", (_e, id: string) => {
  db.prepare(`DELETE FROM participants WHERE id = ?`).run(id);
});

ipcMain.handle("participants:bulkDelete", (_e, ids: string[]) => {
  const del = db.prepare(`DELETE FROM participants WHERE id = ?`);
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
  return db
    .prepare(
      `SELECT dr.*, p.name as participant_name, pr.name as prize_name
       FROM draw_results dr
       JOIN participants p ON p.id = dr.participant_id
       JOIN prizes pr ON pr.id = dr.prize_id
       WHERE dr.session_id = ?
       ORDER BY dr.drawn_at DESC`
    )
    .all(sessionId);
});

ipcMain.handle("draw:one", (_e, sessionId: string) => {
  return drawOne({ sessionId });
});

ipcMain.handle("present:open", (_e, sessionId: string) => {
  openPresentWindow(sessionId);
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

  if (ext === "csv") {
    const text = fs.readFileSync(filePath, "utf-8");
    return { ext, text };
  }
  const buffer = fs.readFileSync(filePath);
  return { ext, base64: buffer.toString("base64") };
});
