import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "./db";
import { commitDraw, DrawCandidate, drawOne, pickWinner, recordPendingDraw, resetSession } from "./drawEngine";
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

// Tên session thật (sessions.name) để ghép vào tiêu đề cửa sổ phụ (xem getWindowTitle trong
// appConfig.ts) — đọc thẳng qua better-sqlite3 (đồng bộ, đủ nhanh cho 1 câu SELECT 1 dòng lúc mở cửa
// sổ). "Untitled Session" cho id lạ/đã bị xoá thay vì để trống — không nên xảy ra bình thường (nút mở
// cửa sổ luôn đi kèm 1 sessionId đang hiện hữu) nhưng vẫn cần 1 fallback không trông như lỗi.
function getSessionName(sessionId: string): string {
  const row = db.prepare(`SELECT name FROM sessions WHERE id = ?`).get(sessionId) as { name: string } | undefined;
  return row?.name ?? "Untitled Session";
}

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

// 1 cửa sổ Present ĐỘC LẬP cho MỖI session (khoá theo sessionId, không phải 1 singleton toàn app) —
// mở cho session B trong lúc Present của session A còn đang mở sẽ ra 1 cửa sổ MỚI, không focus nhầm
// lại cửa sổ A (bug đã gặp thật: trước đây dùng 1 biến `BrowserWindow | null` DUY NHẤT cho mọi
// session). Mở lại ĐÚNG session đang có cửa sổ chỉ focus lại, không tạo trùng.
const presentWindows = new Map<string, BrowserWindow>();

// Cửa sổ "Present mode" riêng biệt để trình chiếu, có thể kéo sang màn hình 2. Mở WINDOWED (không
// fullscreen ngay) để người vận hành kéo cửa sổ sang đúng màn hình muốn trình chiếu trước, rồi mới
// bấm fullscreen (nút overlay trong PresentMode.tsx hoặc phím F11) — nếu tự fullscreen ngay khi mở
// thì mặc định luôn dính màn hình chính, phải thoát fullscreen mới kéo được, bất tiện hơn.
function openPresentWindow(sessionId: string) {
  const existing = presentWindows.get(sessionId);
  if (existing) {
    existing.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: "#FFFFFF",
    title: getWindowTitle("Presentation", getSessionName(sessionId)),
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  presentWindows.set(sessionId, win);

  // Khoá tiêu đề — cùng lý do đã ghi ở createMainWindow's page-title-updated (index.html có <title>
  // tĩnh, không được phép ghi đè tiêu đề đã set theo session/role ở trên).
  win.on("page-title-updated", (e) => e.preventDefault());

  // Ẩn menu bar File/Edit/View/Window/Help — cửa sổ trình chiếu cho người xem tại sự kiện thấy, không
  // phải màn hình làm việc. removeMenu() chỉ có tác dụng Windows/Linux (menu trong khung cửa sổ);
  // macOS dùng menu bar toàn cục trên cùng của OS nên không ảnh hưởng, không cần xử lý riêng.
  win.removeMenu();

  // Toggle fullscreen bằng F11 — tự bắt phím ở main process (KHÔNG dựa vào accelerator của menu mặc
  // định vì đã removeMenu() ở trên, và để hành vi giống nhau trên cả Windows lẫn macOS thay vì lệ
  // thuộc phím tắt fullscreen mặc định khác nhau của từng OS). CỐ Ý không dùng Esc: cửa sổ Present
  // dùng Esc dày đặc cho việc khác (EscapeKeyHandler — ẩn Scoreboard, huỷ popup Confirm/Draw Mode/
  // info..., xem LandingRenderer.tsx). before-input-event không preventDefault() nên phím vẫn lọt
  // xuống renderer — nếu Esc cũng thoát fullscreen ở đây thì 1 lần bấm Esc lúc đang mở popup sẽ vừa
  // đóng popup vừa thoát fullscreen cùng lúc, gây khó hiểu (bug đã cân nhắc, bỏ Esc để tránh hẳn).
  // F11 an toàn vì không nơi nào khác trong app dùng phím này. Toggle không đụng gì tới sequence
  // (Draw/Confirm/spinning...) nên bấm bất cứ lúc nào, kể cả đang quay, cũng không làm gián đoạn gì.
  // Đóng qua `win` (closure riêng của ĐÚNG cửa sổ này) thay vì biến module-level như trước — mỗi
  // session giờ có 1 cửa sổ Present RIÊNG nên không còn 1 biến duy nhất để tham chiếu nữa.
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  // Báo cho renderer biết trạng thái fullscreen hiện tại (để đổi icon nút toggle, kể cả khi người
  // dùng thoát fullscreen bằng cách khác — vd nút xanh lá trên macOS — không chỉ qua IPC toggle).
  win.on("enter-full-screen", () => win.webContents.send("present:fullscreen-changed", true));
  win.on("leave-full-screen", () => win.webContents.send("present:fullscreen-changed", false));

  const hash = `#/present/${sessionId}`;
  if (IS_DEV) {
    win.loadURL(`http://localhost:5173/${hash}`);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"), { hash });
  }

  win.on("closed", () => {
    presentWindows.delete(sessionId);
  });
}

// 1 cửa sổ Builder ĐỘC LẬP cho MỖI session (khoá theo sessionId) — cùng lý do đã ghi ở
// `presentWindows` phía trên. `landingBuilderDirty` theo dõi trạng thái "chưa lưu" RIÊNG cho TỪNG cửa
// sổ (trước đây 1 boolean DUY NHẤT đủ dùng vì chỉ có 1 cửa sổ Builder tồn tại cùng lúc) — map theo
// CHÍNH đối tượng `BrowserWindow`, cập nhật qua `BrowserWindow.fromWebContents(e.sender)` để biết
// ĐÚNG renderer nào vừa gửi tín hiệu dirty (nhiều cửa sổ Builder gửi cùng 1 channel
// "landingBuilder:dirty-changed", không còn suy được "cửa sổ nào" nếu chỉ đọc mỗi payload).
const landingBuilderWindows = new Map<string, BrowserWindow>();
const landingBuilderDirty = new Map<BrowserWindow, boolean>();

ipcMain.on("landingBuilder:dirty-changed", (e, dirty: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) landingBuilderDirty.set(win, dirty);
});

// Cửa sổ phụ chứa Landing Page Builder (canvas + toolbar nổi) — tách riêng khỏi cửa sổ chính vì
// cần toàn bộ màn hình cho canvas, giống cách Present mode cũng mở cửa sổ riêng.
function openLandingBuilderWindow(sessionId: string) {
  const existing = landingBuilderWindows.get(sessionId);
  if (existing) {
    existing.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0B0B10",
    title: getWindowTitle("Builder", getSessionName(sessionId)),
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  landingBuilderWindows.set(sessionId, win);

  // Khoá tiêu đề — cùng lý do đã ghi ở createMainWindow's page-title-updated.
  win.on("page-title-updated", (e) => e.preventDefault());

  // Chặn đóng đột ngột nếu Builder còn thay đổi chưa lưu — giống hệt guard của cửa sổ chính,
  // nhưng dùng cờ riêng (theo ĐÚNG cửa sổ này, xem `landingBuilderDirty` phía trên) vì đây là 1 cửa
  // sổ độc lập, đóng nó không nên phụ thuộc/ảnh hưởng tới cửa sổ Builder khác đang mở cho session khác.
  win.on("close", (e) => {
    if (!landingBuilderDirty.get(win)) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Cancel", "Close and discard changes"],
      defaultId: 0,
      cancelId: 0,
      message: "The Landing Builder has unsaved changes",
      detail: "If you close this window now, unsaved changes will be lost.",
    });
    if (choice === 1) {
      landingBuilderDirty.set(win, false);
      win.destroy();
    }
  });

  const hash = `#/landing-builder/${sessionId}`;
  if (IS_DEV) {
    win.loadURL(`http://localhost:5173/${hash}`);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"), { hash });
  }

  win.on("closed", () => {
    landingBuilderWindows.delete(sessionId);
    landingBuilderDirty.delete(win);
  });
}

// 1 cửa sổ Data Editor ĐỘC LẬP cho MỖI session — cùng lý do + cùng cơ chế dirty-theo-từng-cửa-sổ đã
// ghi ở `landingBuilderWindows`/`landingBuilderDirty` phía trên. Reuse ĐÚNG channel
// "editor:dirty-changed" đã có sẵn (renderer gọi qua window.api.editor.reportDirty, xem
// DataEditorModal.tsx) — trước đây guard cho `mainWindow` (Data Editor từng là modal trong cửa sổ
// chính, chỉ có ĐÚNG 1 nơi gửi dirty nên không cần phân biệt "cửa sổ nào"); giờ có thể nhiều cửa sổ
// Editor cùng gửi chung 1 channel này nên PHẢI tách theo `BrowserWindow.fromWebContents(e.sender)`.
const dataEditorWindows = new Map<string, BrowserWindow>();
const dataEditorDirty = new Map<BrowserWindow, boolean>();

ipcMain.on("editor:dirty-changed", (e, dirty: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) dataEditorDirty.set(win, dirty);
});

// Cửa sổ phụ chứa Data Editor (chỉnh participant) — tách riêng khỏi cửa sổ chính, giống hệt Landing
// Builder/Present Mode (xem 2 hàm openXxxWindow ở trên) thay vì hiện dưới dạng modal trong cửa sổ
// chính như trước — nhất quán "mọi việc lớn liên quan tới 1 session cụ thể đều có cửa sổ riêng".
function openDataEditorWindow(sessionId: string) {
  const existing = dataEditorWindows.get(sessionId);
  if (existing) {
    existing.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0B0B10",
    title: getWindowTitle("Editor", getSessionName(sessionId)),
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  dataEditorWindows.set(sessionId, win);

  win.on("page-title-updated", (e) => e.preventDefault());

  // Chặn đóng đột ngột nếu Data Editor còn thay đổi chưa lưu — cùng khuôn với Landing Builder's guard
  // ở trên. `requestClose()` bên trong DataEditorModal.tsx ĐÃ tự hỏi xác nhận riêng (confirm() JS)
  // trước khi gọi `onClose` khi đóng qua nút X TRONG app — dialog ở ĐÂY chỉ còn cần thiết cho đường
  // đóng KHÔNG đi qua React (nút X thật của cửa sổ/Alt+F4), xem doc-comment DataEditorWindow.tsx.
  win.on("close", (e) => {
    if (!dataEditorDirty.get(win)) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Cancel", "Close and discard changes"],
      defaultId: 0,
      cancelId: 0,
      message: "The Data Editor has unsaved changes",
      detail: "If you close this window now, unsaved changes will be lost.",
    });
    if (choice === 1) {
      dataEditorDirty.set(win, false);
      win.destroy();
    }
  });

  const hash = `#/data-editor/${sessionId}`;
  if (IS_DEV) {
    win.loadURL(`http://localhost:5173/${hash}`);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"), { hash });
  }

  win.on("closed", () => {
    dataEditorWindows.delete(sessionId);
    dataEditorDirty.delete(win);
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

// Chỉ trả dòng confirmed = 1 — đây là nguồn dữ liệu SỐNG cho Present Mode (Scoreboard/WinnerName...,
// xem useLandingData.ts), phải luôn khớp đúng "ai đã thật sự trúng" như hành vi trước khi có cột
// confirmed. Lịch sử ĐẦY ĐỦ (kể cả lượt Redo chưa Confirm) dùng riêng sessions:drawHistory bên dưới,
// chỉ Dashboard đọc.
ipcMain.handle("sessions:results", (_e, sessionId: string) => {
  return resolveDrawRows(sessionId, `AND dr.confirmed = 1`);
});

// Toàn bộ lịch sử quay (kể cả confirmed = 0 — đã pick nhưng bị Redo/bỏ dở) cho Dashboard — xem
// docs/architecture/draw-engine.md.
ipcMain.handle("sessions:drawHistory", (_e, sessionId: string) => {
  return resolveDrawRows(sessionId, ``);
});

function resolveDrawRows(sessionId: string, extraWhere: string): any[] {
  const rows = db
    .prepare(
      `SELECT dr.*,
              p.name as participant_name, p.code as participant_code, p.phone as participant_phone,
              p.email as participant_email, p.extra_data as participant_extra_data,
              pr.name as prize_name, pr.code as prize_code, pr.display_image as prize_display_image
       FROM draw_results dr
       JOIN participants p ON p.id = dr.participant_id
       JOIN prizes pr ON pr.id = dr.prize_id
       WHERE dr.session_id = ? ${extraWhere}
       ORDER BY dr.drawn_at DESC`
    )
    .all(sessionId) as any[];

  // Kết quả hiển thị (Winner Name/Scoreboard) đọc theo cột nào đang được Data Editor gán Data Type
  // Name/Phone/Code/Email cho session này — KHÔNG đọc cứng p.name/.phone/... (xem
  // docs/architecture/draw-engine.md). participant_extra_data chỉ dùng để resolve ở đây, không trả
  // ra ngoài (giữ đúng shape DrawResultRow cũ, tránh renderer phải đổi theo). PHẢI lọc
  // status != 'removed' giống participants:list — thiếu lọc này thì dòng đã soft-delete (vd batch
  // import cũ còn ghi thẳng cột SQL name/phone/...) khiến activeCoreFields tưởng nhầm cột đó đang có
  // dữ liệu thật, participant_name/_phone/... của kết quả CONFIRMED sẽ ra rỗng dù người trúng có tên
  // thật ở cột extra_data khác (bug đã gặp thật, cùng gốc với drawEngine.ts's pickWinner).
  const session = db.prepare(`SELECT participant_column_types FROM sessions WHERE id = ?`).get(sessionId) as
    | { participant_column_types: string | null }
    | undefined;
  const allParticipants = db
    .prepare(`SELECT name, phone, code, email, extra_data FROM participants WHERE session_id = ? AND status != 'removed'`)
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
}

ipcMain.handle("draw:one", (_e, sessionId: string) => {
  return drawOne({ sessionId });
});

// Chọn ứng viên nhưng CHƯA ghi DB — dùng cho Button "Draw" trên Landing Page, cần xem trước
// trước khi Confirm/Redo (xem drawEngine.ts:pickWinner).
ipcMain.handle(
  "draw:pick",
  (_e, data: { sessionId: string; excludeParticipantIds?: string[]; lockedPrizeId?: string }) => {
    const candidate = pickWinner(data);
    // Ghi ngay ở trạng thái chưa Confirm — để lại lịch sử kể cả khi candidate này bị Redo bỏ dở
    // (xem doc-comment recordPendingDraw trong drawEngine.ts, dùng cho Dashboard).
    recordPendingDraw(candidate, data.sessionId);
    return candidate;
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

// `event.sender` scope đúng theo cửa sổ Present đang gọi (không cần biết sessionId nào) — trả lại
// trạng thái fullscreen MỚI để renderer cập nhật icon nút toggle ngay, không cần đợi round-trip
// qua sự kiện enter-full-screen/leave-full-screen. Không cần khoá gì theo sequence.spinning — toggle
// cửa sổ chỉ đổi kích thước hiển thị, không đụng gì tới tiến trình quay đang chạy trong renderer.
ipcMain.handle("present:toggleFullscreen", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return false;
  const next = !win.isFullScreen();
  win.setFullScreen(next);
  return next;
});

ipcMain.handle("landingBuilder:open", (_e, sessionId: string) => {
  openLandingBuilderWindow(sessionId);
});

ipcMain.handle("dataEditor:open", (_e, sessionId: string) => {
  openDataEditorWindow(sessionId);
});

// Button action "openLink" trên Landing Page — luôn mở bằng trình duyệt mặc định của hệ điều hành
// (shell.openExternal), không phải cửa sổ trong app. Chỉ nhận http/https — URL trong extra_data
// là dữ liệu do người tổ chức tự nhập vào danh sách participant, nhưng vẫn chặn scheme lạ
// (file://, custom scheme...) để tránh mở nhầm thứ ngoài ý muốn. Người tổ chức nhập URL vào Excel/
// CSV RẤT hay thiếu tiền tố "https://" (vd "facebook.com/abc") — trước đây bị chặn ÂM THẦM y hệt
// scheme lạ, khiến nút Open Link bấm được nhưng không mở gì cả, không có cách nào biết vì sao (bug
// đã gặp thật). Chỉ URL đã có SẴN 1 scheme khác (vd "ftp://", "file://") mới coi là "scheme lạ" và
// chặn — chưa có scheme nào cả thì mặc định thêm "https://" rồi mở, không chặn nữa.
ipcMain.handle("shell:openExternal", (_e, url: string) => {
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
  const normalized = hasScheme ? url : `https://${url}`;
  if (!/^https?:\/\//i.test(normalized)) return;
  shell.openExternal(normalized);
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
