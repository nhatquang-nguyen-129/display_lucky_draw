// PHẢI là import đầu tiên — đặt userData riêng cho bản dev TRƯỚC khi db.ts/auth.ts tính đường dẫn.
import "./config/cloudEnv";
import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import { randomUUID } from "crypto";
import {
  assertInputsUnlocked,
  assertSessionUnlocked,
  closeAll,
  createSession,
  DATA_DIR,
  deleteSession,
  getDb,
  listConflicts,
  listSessionFiles,
  listSessions,
  listTrash,
  renameSession,
  resolveConflict,
  keepBothConflict,
  restoreFromTrash,
  setSessionClosed,
  setSessionLocked,
  setTabOrder,
  duplicateSession,
  SessionLockLevel,
  LOCK_FULL,
} from "./db";
import { commitDraw, DrawCandidate, drawOne, pickWinner, recordPendingDraw, resetSession } from "./drawEngine";
import { computeActiveCoreFields, resolveParticipantField } from "./participantFields";
import * as cloudSync from "./cloudSync";
import * as cloudAssets from "./cloudAssets";
import * as auth from "./auth";
import { APP_NAME, IS_DEV, getWindowTitle } from "./config/appConfig";
import { importVideo, purgeUnusedMedia, registerMediaProtocol, registerMediaScheme } from "./media";

// Scheme ldmedia:// (video của Landing, xem media.ts) — Electron bắt buộc đăng ký trước app ready.
registerMediaScheme();

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
  try {
    const row = getDb(sessionId).prepare(`SELECT name FROM sessions WHERE id = ?`).get(sessionId) as { name: string } | undefined;
    return row?.name ?? "Untitled Session";
  } catch {
    return "Untitled Session";
  }
}

// Thoát app: đồng bộ mọi session còn cờ "chưa đồng bộ" (xem cloudSync.flushDirty), tối đa
// QUIT_FLUSH_MS — chưa xong thì hỏi "Wait / Quit anyway". Chọn gì thì cờ vẫn còn trên đĩa, lần login sau
// tự đẩy tiếp.
let quitting = false;
const QUIT_FLUSH_MS = 5_000;
const QUIT_WAIT_MORE_MS = 30_000;

async function confirmQuit(): Promise<boolean> {
  let remaining = await cloudSync.flushDirty(QUIT_FLUSH_MS);
  while (remaining.length > 0) {
    if (!mainWindow || mainWindow.isDestroyed()) return true;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "warning",
      buttons: ["Wait", "Quit anyway"],
      defaultId: 0,
      cancelId: 0,
      message: `${remaining.length} session${remaining.length === 1 ? " has" : "s have"} not been synced to the cloud yet`,
      detail:
        "Check the internet connection and choose Wait to try again. If you quit now, the changes stay on this " +
        "computer and will sync the next time this account logs in here.",
    });
    if (choice === 1) return true;
    remaining = await cloudSync.flushDirty(QUIT_WAIT_MORE_MS);
  }
  return true;
}

// Popup "Reconnecting..." hiện ở cửa sổ chính + Landing Builder + Data Editor — KHÔNG gửi tới cửa sổ
// Present (đang chiếu lên LED, khán giả sẽ thấy). Present vẫn quay bình thường khi mất mạng, Confirm được
// đánh dấu "chưa đồng bộ" và tự đẩy khi có mạng lại.
function sendToOperatorWindows(channel: string, ...args: unknown[]) {
  const windows = [mainWindow, ...landingBuilderWindows.values(), ...dataEditorWindows.values()];
  for (const w of windows) if (w && !w.isDestroyed()) w.webContents.send(channel, ...args);
}

// Báo renderer khi phiên đăng nhập bị thu hồi (401/403 — bị phiên khác chiếm, Force logout, Disable;
// KHÁC mất mạng tạm thời, xem auth.ts's startHeartbeat) hoặc khi mất/được lại kết nối tạm thời — KHÔNG
// đóng cửa sổ phụ nào (Present/Builder/Data Editor), app chạy live tại sự kiện.
auth.onRevoked(() => mainWindow?.webContents.send("auth:revoked"));
auth.onConnectivityChange((offline) => sendToOperatorWindows("auth:connectivity", offline));
cloudSync.onStatusChange((sessionId, status) => mainWindow?.webContents.send("sync:status", { sessionId, status }));
cloudSync.onSessionsChanged(() => mainWindow?.webContents.send("sync:sessionsChanged"));
// Không Pull đè/chuyển vào Trash session đang mở cửa sổ phụ (renderer giữ dữ liệu trong bộ nhớ).
cloudSync.setBusyCheck(
  (sessionId) => presentWindows.has(sessionId) || landingBuilderWindows.has(sessionId) || dataEditorWindows.has(sessionId)
);

// Giai đoạn 4 (CLAUDE.md): debounce THÍCH ỨNG cho Landing Builder/Data Editor — Save chỉ đổi text/vị trí
// (không có data: URI mới/lớn) đồng bộ gần như ngay; Save có ảnh/video lớn (sẽ phải dehydrate + có thể
// upload asset lúc đồng bộ) đợi lâu hơn, tránh làm lại việc đó nhiều lần nếu người dùng Save liên tục
// trong lúc đang chỉnh ảnh (resize/crop/đổi ảnh khác...).
const SYNC_SOON_EDIT_WINDOW_FAST_MS = 2_500;
const SYNC_SOON_EDIT_WINDOW_SLOW_MS = 9_000;

// Điểm chốt đồng bộ cho MỌI IPC ghi dữ liệu: luôn đánh dấu "chưa đồng bộ"; gọi từ cửa sổ chính/Present
// (thao tác edit/delete rời rạc, Confirm) thì đồng bộ ngay (gom 1,5s).
//
// Gọi từ Landing Builder/Data Editor: nếu session đang có cửa sổ Present mở (đang chiếu cho khán giả) —
// CHỈ đánh dấu, đồng bộ 1 lần lúc đóng cửa sổ đó như trước (quyết định giai đoạn 0 — tránh thao tác sửa
// dở lên màn LED trước khán giả). Nếu KHÔNG có Present nào mở — cũng đồng bộ trong lúc đang sửa, debounce
// dài hơn cửa sổ chính (`heavy` = Save vừa rồi có khả năng kéo theo dehydrate/upload asset, xem
// cloudAssets.hasLargeInlineAsset).
function touched(e: Electron.IpcMainInvokeEvent, sessionId: string, opts?: { heavy?: boolean }) {
  cloudSync.markDirty(sessionId);
  const win = BrowserWindow.fromWebContents(e.sender);
  const fromEditWindow =
    !!win && ([...landingBuilderWindows.values()].includes(win) || [...dataEditorWindows.values()].includes(win));
  if (!fromEditWindow) {
    cloudSync.syncSoon(sessionId);
    return;
  }
  if (presentWindows.has(sessionId)) return;
  cloudSync.syncSoon(sessionId, opts?.heavy ? SYNC_SOON_EDIT_WINDOW_SLOW_MS : SYNC_SOON_EDIT_WINDOW_FAST_MS);
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

  mainWindow.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    // Thoát app = đăng xuất: đẩy nốt phần chưa đồng bộ (confirmQuit) rồi nhả khoá phiên + xoá phiên đã lưu
    // (auth.logoutOnQuit, tối đa 3 giây) — lần mở sau luôn phải đăng nhập lại.
    void confirmQuit()
      .catch(() => true)
      .then(() => auth.logoutOnQuit(3_000).catch(() => undefined))
      .then(() => mainWindow?.close());
  });

  if (IS_DEV) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Mỗi lần trang tải xong (mở app, reload sau Log out) — trả focus bàn phím về nội dung trang. Trên
  // Windows, sau hộp thoại native (confirm/alert) hoặc reload, Electron đôi khi để trang mất focus: màn
  // Sign in hiện ra nhưng không gõ được vào ô nhập cho tới khi cửa sổ được focus lại.
  mainWindow.webContents.on("did-finish-load", () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) mainWindow.webContents.focus();
  });

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
    // Điểm chốt: kết thúc lượt trình chiếu — đẩy nốt lượt Draw chưa Confirm/phần còn lại.
    void cloudSync.syncSession(sessionId);
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
  // Dọn video mồ côi TRƯỚC khi Builder mở (chưa có lịch sử Undo nào) — xem purgeUnusedMedia. Lỗi dọn
  // dẹp không được chặn việc mở Builder.
  try {
    purgeUnusedMedia(sessionId);
  } catch (e) {
    console.warn("[media] purge failed:", e);
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
    // Điểm chốt: mọi lần Save trong Builder chỉ đánh dấu — đồng bộ 1 lần lúc đóng cửa sổ.
    void cloudSync.syncSession(sessionId);
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
    // Điểm chốt: mọi lần Save trong Data Editor chỉ đánh dấu — đồng bộ 1 lần lúc đóng cửa sổ.
    void cloudSync.syncSession(sessionId);
  });
}

app.whenReady().then(() => {
  app.setName(APP_NAME);
  registerMediaProtocol();

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

// macOS mặc định giữ app chạy khi đóng hết cửa sổ — bản đóng gói thì thoát hẳn giống Windows: đóng
// cửa sổ là DB được đóng/gộp -wal ngay (xem will-quit), rút USB sau đó không hỏng dữ liệu. Dev giữ
// nguyên hành vi Mac.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || app.isPackaged) app.quit();
});

// Chỉ bản đóng gói (lock xin ở db.ts): double-click mở app lần 2 → đưa cửa sổ đang chạy lên trước.
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

// Đóng mọi file session khi thoát (xem db.ts — mỗi session 1 file, journal_mode DELETE nên file đã
// đầy đủ sau mỗi lần ghi; đóng cho sạch lock file).
app.on("will-quit", () => {
  closeAll();
});

/* ---------------- IPC: Participants (thuộc về 1 session) ---------------- */

type ExtraData = Record<string, string>;

ipcMain.handle("participants:list", (_e, sessionId: string) => {
  return getDb(sessionId)
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
  const row = getDb(sessionId)
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
  const row = getDb(sessionId)
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
    assertInputsUnlocked(data.sessionId);
    const id = randomUUID();
    getDb(data.sessionId).prepare(
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
    touched(_e, data.sessionId);
    return id;
  }
);

ipcMain.handle(
  "participants:update",
  (
    _e,
    data: {
      sessionId: string;
      id: string;
      name: string;
      code?: string | null;
      phone?: string | null;
      email?: string | null;
      extra?: ExtraData;
    }
  ) => {
    assertInputsUnlocked(data.sessionId);
    getDb(data.sessionId).prepare(
      `UPDATE participants SET name = ?, code = ?, phone = ?, email = ?, extra_data = ? WHERE id = ?`
    ).run(
      data.name,
      data.code ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.extra && Object.keys(data.extra).length ? JSON.stringify(data.extra) : null,
      data.id
    );
    touched(_e, data.sessionId);
  }
);

ipcMain.handle(
  "participants:bulkImport",
  (
    _e,
    sessionId: string,
    rows: Array<{ name: string; code?: string; phone?: string; email?: string; extra?: ExtraData }>
  ) => {
    assertInputsUnlocked(sessionId);
    const db = getDb(sessionId);
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
    const result = tx(rows);
    // Ghi lại ĐÚNG danh sách tên cột của lần import này (không phải cộng dồn/giữ cột cũ) — Dashboard
    // dùng để hiện lại đúng dữ liệu gốc, phân biệt với cột tự tạo sau này qua Generate (xem
    // docs/architecture/database-schema.md).
    const columns = new Set<string>();
    for (const row of rows) if (row.extra) for (const key of Object.keys(row.extra)) columns.add(key);
    db.prepare(`UPDATE sessions SET imported_columns = ? WHERE id = ?`).run(JSON.stringify([...columns]), sessionId);
    touched(_e, sessionId);
    return result;
  }
);

// Soft-delete: giữ hàng lại để đối chiếu với số liệu gốc (xem participants:stats). Draw Engine lọc
// status = 'active' nên hàng 'removed' tự động không vào vòng quay; participants:list cũng ẩn nó đi.
ipcMain.handle("participants:delete", (_e, sessionId: string, id: string) => {
  assertInputsUnlocked(sessionId);
  getDb(sessionId).prepare(`UPDATE participants SET status = 'removed' WHERE id = ?`).run(id);
  touched(_e, sessionId);
});

ipcMain.handle("participants:bulkDelete", (_e, sessionId: string, ids: string[]) => {
  assertInputsUnlocked(sessionId);
  const db = getDb(sessionId);
  const del = db.prepare(`UPDATE participants SET status = 'removed' WHERE id = ? AND status != 'removed'`);
  const tx = db.transaction((items: string[]) => {
    let deleted = 0;
    for (const id of items) deleted += del.run(id).changes;
    return deleted;
  });
  const result = tx(ids);
  touched(_e, sessionId);
  return result;
});

// Ghi lại thứ tự dòng sau khi kéo-thả sắp xếp trong Data Editor — orderedIds đã đúng thứ tự mong muốn.
ipcMain.handle("participants:reorder", (_e, sessionId: string, orderedIds: string[]) => {
  assertInputsUnlocked(sessionId);
  const db = getDb(sessionId);
  const update = db.prepare(`UPDATE participants SET sort_order = ? WHERE id = ?`);
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, index) => update.run(index, id));
  });
  tx(orderedIds);
  touched(_e, sessionId);
});

/* ---------------- IPC: Prizes (thuộc về 1 session) ---------------- */

ipcMain.handle("prizes:list", (_e, sessionId: string) => {
  return getDb(sessionId).prepare(`SELECT * FROM prizes WHERE session_id = ? ORDER BY created_at DESC`).all(sessionId);
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
  assertInputsUnlocked(data.sessionId);
  const id = randomUUID();
  getDb(data.sessionId).prepare(
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
    data.allowDuplicateWithOtherPrizes ? 1 : 0,
    data.allowDuplicateWithSamePrize ? 1 : 0,
    data.maxWinCount ?? 1,
    data.displayImage ?? null
  );
  touched(_e, data.sessionId);
  return id;
});

ipcMain.handle("prizes:update", (_e, data: PrizeInput & { id: string }) => {
  assertInputsUnlocked(data.sessionId);
  const db = getDb(data.sessionId);
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
    data.allowDuplicateWithOtherPrizes ? 1 : 0,
    data.allowDuplicateWithSamePrize ? 1 : 0,
    data.maxWinCount ?? 1,
    data.displayImage ?? null,
    data.id
  );
  touched(_e, data.sessionId);
});

ipcMain.handle("prizes:delete", (_e, sessionId: string, id: string) => {
  assertInputsUnlocked(sessionId);
  getDb(sessionId).prepare(`DELETE FROM prizes WHERE id = ?`).run(id);
  touched(_e, sessionId);
});

/* ---------------- IPC: Sessions (= tab, đơn vị chứa 1 sự kiện quay số độc lập) ---------------- */

// Mỗi session = 1 file trong data/ (xem db.ts) — mỗi lần gọi quét lại thư mục, nên file vừa copy vào
// data/ lúc app đang mở tự hiện thành tab mới (renderer gọi lại khi cửa sổ chính được focus).
ipcMain.handle("sessions:list", () => listSessions());
// Mọi session đang đăng ký, KỂ CẢ tab Closed — dùng cho SessionsModal.tsx (nút "Open" ở TabBar.tsx),
// khác sessions:list (chỉ trả tab đang mở, cho TabBar chính).
ipcMain.handle("sessions:listAll", () => listSessionFiles());

// Session nào đang có ≥ 2 bản (cùng id, khác file) trong data/ — renderer hiện hộp thoại cho chọn.
ipcMain.handle("sessions:conflicts", () => listConflicts());
ipcMain.handle("sessions:resolveConflict", (_e, data: { sessionId: string; keepFile: string }) =>
  resolveConflict(data.sessionId, data.keepFile)
);
// "Keep both" — cấp id mới cho đúng bản được chọn, giữ mọi bản (xem keepBothConflict trong db.ts).
ipcMain.handle("sessions:keepBothConflict", (_e, data: { sessionId: string; file: string }) => {
  const newId = keepBothConflict(data.sessionId, data.file);
  touched(_e, newId);
  return newId;
});
ipcMain.handle("sessions:openDataFolder", () => shell.openPath(DATA_DIR));
ipcMain.handle("sessions:listTrash", () => listTrash());
ipcMain.handle("sessions:restoreFromTrash", (_e, data: { file: string }) => {
  const target = restoreFromTrash(data.file);
  // Session vừa khôi phục chưa có trạng thái đồng bộ = "chưa đồng bộ" — Push lên (Worker tự gỡ dấu đã xoá).
  void cloudSync.syncAll();
  return target;
});

// Account/Auth — đăng nhập qua Cloudflare Worker (cloud/worker/), thay mô hình Space ẩn danh cũ. Lời
// gọi network DUY NHẤT trong app vẫn như trước (xem electron/auth.ts + electron/cloudSync.ts), chỉ
// khác: đồng bộ theo điểm chốt (touched() ở cuối các handler ghi dữ liệu, đóng cửa sổ phụ, thoát app —
// xem cloudSync.ts), không còn nút Push/Pull/Connect tay.
ipcMain.handle("auth:getSession", () => auth.getSession());
ipcMain.handle("auth:login", (_e, data: { username: string; password: string }) => auth.login(data));
// Lần đầu (chưa kích hoạt): Access Code (= ADMIN_TOKEN) + tạo admin. Quên mật khẩu admin: Access Code + mật khẩu mới.
ipcMain.handle("auth:verifyAccessCode", (_e, accessCode: string) => auth.verifyAccessCode(accessCode));
ipcMain.handle("auth:activate", (_e, data: { accessCode: string; username: string; password: string }) => auth.activate(data));
ipcMain.handle("auth:resetAdminPassword", (_e, data: { accessCode: string; password: string }) => auth.resetAdminPassword(data));
ipcMain.handle("auth:getStartupStatus", () => auth.getStartupStatus());
ipcMain.handle("auth:retryStartup", () => auth.retryStartup());
ipcMain.handle("auth:logout", () => auth.logout());
ipcMain.handle("auth:importLooseFiles", (_e, files: string[]) => auth.importLooseFiles(files));
// Trạng thái đồng bộ (chấm trên tab, SessionsModal.tsx) + điểm chốt từ renderer (chuyển/mở tab).
ipcMain.handle("sync:getStatuses", () => cloudSync.getStatuses());
ipcMain.handle("sync:session", (_e, sessionId: string) => cloudSync.syncSession(sessionId));
ipcMain.handle("sync:all", () => cloudSync.syncAll());

// Quản lý account — chỉ account isAdmin mới gọi được (Worker tự chặn 403 nếu không phải, xem
// cloud/worker/src/index.ts requireAdmin()); renderer chỉ hiện mục này khi auth.getSession().isAdmin.
ipcMain.handle("auth:createAccount", (_e, data: { username: string; password: string }) => auth.createAccount(data));
ipcMain.handle("auth:listAccounts", () => auth.listAccounts());
ipcMain.handle("auth:resetAccountPassword", (_e, data: { accountId: string; password: string }) => auth.resetAccountPassword(data));
// Admin: mọi session của 1 account (kèm tình trạng, dung lượng cloud) + khôi phục session đã xoá hình thức.
ipcMain.handle("auth:listAccountSessions", (_e, accountId: string) => auth.listAccountSessions(accountId));
ipcMain.handle("auth:restoreDeletedSession", (_e, data: { accountId: string; sessionId: string }) => auth.restoreDeletedSession(data));
ipcMain.handle("auth:forceLogoutAccount", (_e, accountId: string) => auth.forceLogoutAccount(accountId));
ipcMain.handle("auth:setAccountDisabled", (_e, data: { accountId: string; disabled: boolean }) =>
  auth.setAccountDisabled(data.accountId, data.disabled)
);

// Lấy 1 session theo id — cần riêng vì PresentMode chạy trong BrowserWindow/route tách biệt,
// không có SessionProvider nên không thể lấy activeSession qua context như các trang chính.
ipcMain.handle("sessions:get", (_e, id: string) => {
  try {
    return getDb(id).prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) ?? null;
  } catch {
    return null; // session không còn (file bị xoá/chuyển đi)
  }
});

ipcMain.handle(
  "sessions:create",
  (_e, data: { name: string; allowDuplicatePrize?: boolean; excludePreviousWinners?: boolean }) => {
    const id = createSession(data);
    touched(_e, id);
    return id;
  }
);

ipcMain.handle("sessions:rename", (_e, data: { id: string; name: string }) => {
  assertSessionUnlocked(data.id);
  renameSession(data.id, data.name);
  touched(_e, data.id);
});

// Khoá/mở khoá session — không phải bảo mật (không có password), chỉ tránh nhầm lẫn chỉnh sửa sau khi
// đã quay xong. Mở khoá yêu cầu giữ nút 3 giây ở phía renderer (SessionLockMenu.tsx/HoldToUnlockButton.tsx).
// `locked`: 0 = mở, 1 = Full lock, 2 = Input lock (xem SessionLockLevel trong db.ts).
// Khoá bị TỪ CHỐI khi session còn mở cửa sổ phụ mà mức khoá mới sẽ chặn: khoá giữa chừng làm cửa sổ đó
// lỗi ở lần ghi/quay tiếp theo (hoặc mất thay đổi chưa Save) — trả tên cửa sổ để renderer báo người
// dùng đóng trước. Full lock chặn cả 3 cửa sổ; Input lock chỉ chặn Data Editor (Builder/Presentation
// vẫn chạy bình thường khi chỉ khoá đầu vào).
ipcMain.handle("sessions:setLocked", (_e, data: { id: string; locked: SessionLockLevel }) => {
  if (data.locked !== 0) {
    const openWindows = [
      dataEditorWindows.has(data.id) && "Data Editor",
      data.locked === LOCK_FULL && landingBuilderWindows.has(data.id) && "Landing Builder",
      data.locked === LOCK_FULL && presentWindows.has(data.id) && "Presentation",
    ].filter(Boolean) as string[];
    if (openWindows.length > 0) return { ok: false, openWindows };
  }
  setSessionLocked(data.id, data.locked);
  touched(_e, data.id);
  return { ok: true, openWindows: [] };
});

ipcMain.handle(
  "sessions:updateOptions",
  (_e, data: { id: string; allowDuplicatePrize: boolean; excludePreviousWinners: boolean }) => {
    assertInputsUnlocked(data.id);
    getDb(data.id).prepare(`UPDATE sessions SET allow_duplicate_prize = ?, exclude_previous_winners = ? WHERE id = ?`).run(
      data.allowDuplicatePrize ? 1 : 0,
      data.excludePreviousWinners ? 1 : 0,
      data.id
    );
    touched(_e, data.id);
  }
);

// Lưu mapping "cột nào thuộc loại dữ liệu chuẩn hoá nào" — gọi ngay khi người dùng đổi
// trong Data Editor (không gộp vào nút Save chính, vì đây là metadata không phải data dòng).
ipcMain.handle(
  "sessions:updateColumnTypes",
  (_e, data: { id: string; columnTypes: Record<string, string> }) => {
    assertInputsUnlocked(data.id);
    getDb(data.id).prepare(`UPDATE sessions SET participant_column_types = ? WHERE id = ?`).run(
      JSON.stringify(data.columnTypes),
      data.id
    );
    touched(_e, data.id);
  }
);

// Lưu nhãn hiển thị tùy biến của cột trong Data Editor ({ [tênCột]: "Nhãn" }). Cột lõi chỉ đổi nhãn,
// dữ liệu vẫn ở cột SQL name/phone/code/email.
ipcMain.handle(
  "sessions:updateColumnLabels",
  (_e, data: { id: string; columnLabels: Record<string, string> }) => {
    assertInputsUnlocked(data.id);
    getDb(data.id).prepare(`UPDATE sessions SET participant_column_labels = ? WHERE id = ?`).run(
      JSON.stringify(data.columnLabels),
      data.id
    );
    touched(_e, data.id);
  }
);

// Lưu layout Landing Page Builder — Builder chỉ sửa JSON này, PresentMode chỉ render nó.
ipcMain.handle(
  "sessions:updateLandingConfig",
  (_e, data: { id: string; landingConfig: unknown }) => {
    assertSessionUnlocked(data.id);
    getDb(data.id).prepare(`UPDATE sessions SET landing_config = ? WHERE id = ?`).run(
      JSON.stringify(data.landingConfig),
      data.id
    );
    touched(_e, data.id, { heavy: cloudAssets.hasLargeInlineAsset(data.landingConfig) });
  }
);

// Xoá tab = chuyển file của session vào data/.trash/ (không xoá hẳn — có đường lấy lại, xem db.ts).
// Đây là "Delete" (menu chuột phải, SessionLockMenu.tsx) — khác "Close" (nút ×, sessions:setClosed).
ipcMain.handle("sessions:delete", (_e, id: string) => {
  assertInputsUnlocked(id);
  deleteSession(id);
  // Gửi dấu "đã xoá" lên cloud — máy khác login sẽ chuyển session này vào Trash thay vì tải về lại.
  void cloudSync.markSessionDeleted(id);
});

// "Close" (nút × ở TabBar.tsx) — chỉ ẩn khỏi thanh tab, KHÔNG di chuyển file (khác sessions:delete ở
// trên), KHÔNG đụng dữ liệu/trạng thái khoá gì cả — mở lại bất cứ lúc nào qua danh sách "Open"
// vẫn còn nguyên y hệt. Vì vậy KHÔNG assertSessionUnlocked ở đây (khác sessions:rename) — Full lock vẫn
// cho đóng tab để gọn thanh tab, chỉ chặn các thao tác thật sự đổi dữ liệu/metadata.
ipcMain.handle("sessions:setClosed", (_e, data: { id: string; closed: boolean }) => {
  setSessionClosed(data.id, data.closed);
  // Điểm chốt: đóng/mở lại tab — đồng bộ session đó (trạng thái Close cũng nằm trong file session).
  touched(_e, data.id);
});

// Kéo-thả đổi thứ tự tab (TabBar.tsx) — `ids` = toàn bộ tab đang hiện theo thứ tự mới. Không gọi
// assert khoá nào: chỉ là thứ tự hiển thị, lưu ở data/.tab-order.json, không đụng file session nào.
ipcMain.handle("sessions:setTabOrder", (_e, ids: string[]) => {
  setTabOrder(ids);
});

// Nhân bản session (menu chuột phải tab) → id session mới. Không assert khoá: chỉ ĐỌC session gốc,
// bản mới luôn mở khoá + sạch kết quả quay (xem duplicateSession trong db.ts).
ipcMain.handle("sessions:duplicate", (_e, id: string) => {
  const newId = duplicateSession(id);
  touched(_e, newId);
  return newId;
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
  const db = getDb(sessionId);
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
  // docs/architecture/draw-engine.md). participant_extra_data dùng để resolve ở đây, và CŨNG được trả
  // nguyên ra ngoài (Dashboard.tsx dùng để hiện lại đủ các cột đã import — xem
  // sessions.imported_columns). PHẢI lọc status != 'removed' giống participants:list — thiếu lọc này thì dòng đã soft-delete (vd batch
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
    return {
      ...r,
      participant_name: resolveParticipantField(participant, columnTypesJson, "name", activeCoreFields) || r.participant_name,
      participant_phone: resolveParticipantField(participant, columnTypesJson, "phone", activeCoreFields) || r.participant_phone,
      participant_code: resolveParticipantField(participant, columnTypesJson, "code", activeCoreFields) || r.participant_code,
      participant_email: resolveParticipantField(participant, columnTypesJson, "email", activeCoreFields) || r.participant_email,
    };
  });
}

ipcMain.handle("draw:one", (_e, sessionId: string) => {
  assertSessionUnlocked(sessionId);
  return drawOne({ sessionId });
});

// Chọn ứng viên nhưng CHƯA ghi DB — dùng cho Button "Draw" trên Landing Page, cần xem trước
// trước khi Confirm/Redo (xem drawEngine.ts:pickWinner).
ipcMain.handle(
  "draw:pick",
  (_e, data: { sessionId: string; excludeParticipantIds?: string[]; lockedPrizeId?: string }) => {
    assertSessionUnlocked(data.sessionId);
    const candidate = pickWinner(data);
    // Ghi ngay ở trạng thái chưa Confirm — để lại lịch sử kể cả khi candidate này bị Redo bỏ dở
    // (xem doc-comment recordPendingDraw trong drawEngine.ts, dùng cho Dashboard).
    recordPendingDraw(candidate, data.sessionId);
    // Giai đoạn 4: đẩy luôn (gom 1,5s, giống cửa sổ chính) thay vì chỉ đánh dấu — pick nhiều lần liên
    // tiếp (redraw) tự gộp vào 1 lần đồng bộ nhờ debounce, không tốn N request; nhưng app crash ngay sau
    // pick (trước khi Confirm) thì lịch sử vẫn kịp lên cloud thay vì chờ tới Confirm/đóng Present.
    cloudSync.markDirty(data.sessionId);
    cloudSync.syncSoon(data.sessionId);
    return candidate;
  }
);

// Ghi nhận chính thức 1 candidate đã pick — dùng cho Button "Confirm" trên Landing Page.
ipcMain.handle("draw:commit", (_e, data: { candidate: DrawCandidate; sessionId: string }) => {
  assertSessionUnlocked(data.sessionId);
  commitDraw(data.candidate, data.sessionId);
  touched(_e, data.sessionId);
});

// Xoá hết draw_results + trả remaining mọi prize về quantity gốc — dùng cho Button "Reset Session"
// trên Landing Page. Không đụng participants/prizes/session (khác sessions:delete).
ipcMain.handle("draw:resetSession", (_e, sessionId: string) => {
  assertSessionUnlocked(sessionId);
  resetSession(sessionId);
  touched(_e, sessionId);
});

ipcMain.handle("present:open", async (_e, sessionId: string) => {
  if (!(await auth.getSession())) throw new Error("Not logged in.");
  assertSessionUnlocked(sessionId);
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

ipcMain.handle("landingBuilder:open", async (_e, sessionId: string) => {
  if (!(await auth.getSession())) throw new Error("Not logged in.");
  assertSessionUnlocked(sessionId);
  openLandingBuilderWindow(sessionId);
});

// Component Video trên Landing — main tự mở dialog + đọc file bằng fs (renderer không đọc file được,
// và không nên chuyển vài trăm MB qua IPC), ghi BLOB vào bảng media, chỉ trả id về. Xem media.ts.
ipcMain.handle("media:importVideo", (e, sessionId: string) => {
  assertSessionUnlocked(sessionId);
  const result = importVideo(sessionId, BrowserWindow.fromWebContents(e.sender));
  // Import video = luôn có asset mới, lớn — debounce dài như mọi Save có data: URI lớn (xem touched()).
  touched(e, sessionId, { heavy: true });
  return result;
});

ipcMain.handle("dataEditor:open", async (_e, sessionId: string) => {
  if (!(await auth.getSession())) throw new Error("Not logged in.");
  assertInputsUnlocked(sessionId);
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

// Xuất file (Participants / Draw history ra CSV hoặc XLSX) — renderer tự dựng nội dung (papaparse/xlsx
// đã có sẵn ở renderer), main chỉ mở hộp thoại Save + ghi bằng fs, vì renderer không có quyền ghi file
// (contextIsolation). Chỉ đọc dữ liệu → KHÔNG chặn bởi Session Lock. null = người dùng huỷ dialog.
ipcMain.handle(
  "dialog:saveFile",
  async (e, data: { defaultName: string; ext: "csv" | "xlsx"; text?: string; base64?: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const filters =
      data.ext === "csv"
        ? [{ name: "CSV file", extensions: ["csv"] }]
        : [{ name: "Excel workbook", extensions: ["xlsx"] }];
    const options = { defaultPath: path.join(app.getPath("documents"), data.defaultName), filters };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;

    try {
      if (data.text !== undefined) fs.writeFileSync(result.filePath, data.text, "utf-8");
      else fs.writeFileSync(result.filePath, Buffer.from(data.base64 ?? "", "base64"));
      return { filePath: result.filePath };
    } catch (err) {
      // Hay gặp nhất: file đang mở trong Excel (Windows khoá file) → EBUSY/EPERM.
      return { error: `Could not save file: ${(err as Error).message}` };
    }
  }
);
