import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "./db";
import { drawOne } from "./drawEngine";

const isDev = process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;
let presentWindow: BrowserWindow | null = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#121116",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
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
    backgroundColor: "#121116",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const hash = `#/present/${sessionId}`;
  if (isDev) {
    presentWindow.loadURL(`http://localhost:5173/${hash}`);
  } else {
    presentWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash });
  }

  presentWindow.on("closed", () => {
    presentWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ---------------- IPC: Participants ---------------- */

type ExtraData = Record<string, string>;

ipcMain.handle("participants:list", () => {
  return db.prepare(`SELECT * FROM participants ORDER BY created_at DESC`).all();
});

ipcMain.handle(
  "participants:create",
  (_e, data: { name: string; code?: string; phone?: string; email?: string; extra?: ExtraData }) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO participants (id, name, code, phone, email, extra_data) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.name,
      data.code ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.extra && Object.keys(data.extra).length ? JSON.stringify(data.extra) : null
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
  (_e, rows: Array<{ name: string; code?: string; phone?: string; email?: string; extra?: ExtraData }>) => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO participants (id, name, code, phone, email, extra_data, source) VALUES (?, ?, ?, ?, ?, ?, 'import')`
    );
    const tx = db.transaction((items: typeof rows) => {
      let inserted = 0;
      for (const row of items) {
        if (!row.name) continue;
        const result = insert.run(
          randomUUID(),
          row.name,
          row.code ?? null,
          row.phone ?? null,
          row.email ?? null,
          row.extra && Object.keys(row.extra).length ? JSON.stringify(row.extra) : null
        );
        if (result.changes > 0) inserted++;
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

/* ---------------- IPC: Prizes ---------------- */

ipcMain.handle("prizes:list", () => {
  return db.prepare(`SELECT * FROM prizes ORDER BY created_at DESC`).all();
});

ipcMain.handle("prizes:create", (_e, data: { name: string; quantity: number; weight: number }) => {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO prizes (id, name, quantity, remaining, weight) VALUES (?, ?, ?, ?, ?)`
  ).run(id, data.name, data.quantity, data.quantity, data.weight);
  return id;
});

ipcMain.handle("prizes:delete", (_e, id: string) => {
  db.prepare(`DELETE FROM prizes WHERE id = ?`).run(id);
});

/* ---------------- IPC: Sessions ---------------- */

ipcMain.handle("sessions:list", () => {
  return db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all();
});

ipcMain.handle(
  "sessions:create",
  (_e, data: { name: string; prizeIds: string[]; allowDuplicatePrize: boolean; excludePreviousWinners: boolean }) => {
    const id = randomUUID();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO sessions (id, name, allow_duplicate_prize, exclude_previous_winners, status)
         VALUES (?, ?, ?, ?, 'draft')`
      ).run(id, data.name, data.allowDuplicatePrize ? 1 : 0, data.excludePreviousWinners ? 1 : 0);

      const link = db.prepare(`INSERT INTO session_prizes (session_id, prize_id) VALUES (?, ?)`);
      for (const prizeId of data.prizeIds) link.run(id, prizeId);
    });
    tx();
    return id;
  }
);

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
