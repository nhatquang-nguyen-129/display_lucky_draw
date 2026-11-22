import { LandingConfig } from "@/lib/landing/types";

export interface Participant {
  id: string;
  session_id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  extra_data: string | null; // JSON string chứa các cột optional (vd facebook_post, note)
  sort_order: number | null;
  source: string;
  status: string;
  created_at: string;
}

export interface Prize {
  id: string;
  session_id: string;
  code: string | null;
  name: string;
  category: string | null;
  status: string; // "active" | "inactive"
  quantity: number;
  remaining: number;
  weight: number;
  allow_duplicate_with_other_prizes: 0 | 1;
  allow_duplicate_with_same_prize: 0 | 1;
  max_win_count: number;
  display_image: string | null; // base64 data URL (PNG), dùng khi trình chiếu
  image_path: string | null; // trường cũ, không dùng nữa
  created_at: string;
}

export interface Session {
  id: string;
  name: string;
  allow_duplicate_prize: 0 | 1;
  exclude_previous_winners: 0 | 1;
  status: string;
  landing_config: string | null;
  participant_column_types: string | null; // JSON: { [tênCột]: "phone" | "name" | "email" | "text" | "code" | "url" }
  participant_duplicate_columns: string | null; // JSON string[]: các cột xác định trùng lặp (compound key)
  participant_column_labels: string | null; // JSON: { [tênCột]: "Nhãn hiển thị" } — cột lõi chỉ đổi nhãn
  created_at: string;
  // Khoá session — không phải bảo mật (không password), chỉ tránh nhầm lẫn chỉnh sửa sau khi đã quay
  // xong. 0 = mở, 1 = Full lock (chỉ xem), 2 = Input lock (chỉ khoá participant/prize, vẫn quay số +
  // sửa Landing được). Xem sessions.setLocked, assertInputsUnlocked/assertSessionUnlocked trong
  // electron/db.ts, docs/architecture/session-lock.md.
  locked: 0 | 1 | 2;
  // Đóng tab (nút ×) — chỉ ẩn khỏi danh sách trả về (sessions:list), file KHÔNG di chuyển. Khác
  // sessions:delete (chuyển vào data/.trash/). Mở lại qua danh sách Open (sessions.setClosed).
  closed: 0 | 1;
  // Danh sách tên cột của lần Import/Replace gần nhất (JSON string[], null nếu chưa import lần nào
  // qua luồng mới hoặc session tạo trước khi có tính năng này) — Dashboard.tsx dùng để hiện lại đúng
  // dữ liệu gốc đã import, phân biệt với cột tự tạo qua Generate trong Data Editor. Ghi ở
  // participants:bulkImport (electron/main.ts).
  imported_columns: string | null;
}

// 1 session có ≥ 2 file cùng id trong data/ (vd copy qua lại giữa 2 máy, mỗi bên sửa riêng) — khớp
// SessionConflict/SessionCopyInfo trong electron/db.ts.
export interface SessionCopyInfo {
  file: string; // tên file trong data/
  modifiedAt: string; // ISO
  participants: number;
  prizes: number;
  confirmedDraws: number;
  inUse: boolean; // bản app đang dùng
  recommended: boolean; // bản sửa gần nhất
}

export interface SessionConflict {
  sessionId: string;
  name: string;
  copies: SessionCopyInfo[];
}

// Session đã bị Delete (menu chuột phải trên tab, chuyển vào data/.trash/, chưa xoá hẳn — KHÁC Close/
// nút × chỉ ẩn tab) — khớp TrashEntry trong electron/db.ts.
export interface TrashEntry {
  file: string; // tên file trong data/.trash/ — dùng làm tham số cho sessions.restoreFromTrash
  name: string;
  deletedAt: string; // ISO
  participants: number;
  prizes: number;
  confirmedDraws: number;
}

// Account/Auth (Cloudflare Worker + R2) — xem electron/auth.ts, electron/cloudSync.ts,
// docs/architecture/cloud-sync.md. Mọi lời gọi trả { error } thay vì throw, để UI hiện lỗi đọc được.
export type AuthResult<T> = { error: string } | T;

// Phần trả ra renderer — KHÔNG kèm sessionToken (chỉ main process giữ).
export interface PublicSession {
  workerUrl: string;
  accountId: string;
  name: string;
  isAdmin: boolean;
}

export interface LooseSessionFile {
  file: string; // đường dẫn đầy đủ trên máy — truyền thẳng lại cho auth.importLooseFiles
  id: string;
  name: string;
}

export interface LoginResult extends PublicSession {
  // Chỉ có giá trị khi đây là LẦN ĐẦU account này login trên máy này — renderer hỏi người dùng có
  // muốn nhận các session rời (còn nằm thẳng trong data/, từ trước khi có tính năng Account) không.
  looseFiles: LooseSessionFile[];
}

// Cổng vào app (<RequireAuth> trong src/App.tsx) — app bắt buộc có mạng: "offline" = không tới được
// server lúc mở app → màn "No internet connection" + Retry. Thoát app = đăng xuất, nên mở app luôn về
// "logged-out" (xem auth.ts doInit/logoutOnQuit).
// "logged-out" kèm `activated`: false = chưa có admin → màn Access Code (kích hoạt lần đầu); true = màn
// đăng nhập username/password.
export type StartupStatus =
  | { status: "ok"; session: PublicSession }
  | { status: "logged-out"; activated: boolean }
  | { status: "offline" };

// Trạng thái đồng bộ 1 session (chấm trên tab) — xem electron/cloudSync.ts.
// synced = đã lên cloud · dirty = có sửa chưa đồng bộ · syncing = đang đồng bộ · error = lần gần nhất lỗi (mất mạng...)
export type SyncStatus = "synced" | "dirty" | "syncing" | "error";

// Mọi session đang đăng ký, KỂ CẢ tab Closed — xem listSessionFiles() trong electron/db.ts,
// dùng cho SessionsModal.tsx (khác Session/sessions.list ở trên, chỉ trả tab đang mở).
export interface SessionFileInfo {
  id: string;
  name: string;
  closed: boolean;
  file: string;
  mtimeMs: number;
}

// 1 session của 1 account, admin xem trong Settings → Accounts → Sessions (lấy từ metadata trên cloud,
// không mở nội dung). "deleted" = account đó đã xoá trong app — chỉ là xoá hình thức, dữ liệu vẫn còn,
// admin khôi phục được.
export interface AdminSessionRow {
  sessionId: string;
  sessionName: string;
  status: "active" | "deleted";
  deletedAt: string | null; // ISO
  lastSyncedAt: string; // ISO — lần đẩy lên cloud gần nhất
  modifiedAt: string; // ISO — lần sửa gần nhất trên máy (theo bản mới nhất)
  participantCount: number;
  appVersion: string; // phiên bản app đã đẩy bản mới nhất
  versions: number; // số bản đang giữ trên cloud (tối đa 10)
  latestSize: number; // byte — bản mới nhất
  totalSize: number; // byte — mọi bản đang giữ (dung lượng thật trên R2)
}

export interface AccountRow {
  accountId: string;
  name: string;
  username: string;
  createdAt: string;
  isAdmin: boolean;
  disabled: boolean;
  online: boolean;
  lastSeen: string | null;
  sessionCount: number; // session còn hiện với account (không tính đã xoá)
  deletedCount: number; // session đã xoá hình thức (vẫn trên cloud)
  storageBytes: number; // dung lượng thật trên cloud — mọi bản đang giữ, kể cả session đã xoá
  lastSyncedAt: string | null; // ISO — lần đồng bộ gần nhất của account
}

export interface DrawResultRow {
  id: string;
  session_id: string;
  participant_id: string;
  prize_id: string;
  participant_name: string;
  participant_code: string | null;
  participant_phone: string | null;
  participant_email: string | null;
  // JSON string chứa mọi cột đã import (xem Session.imported_columns) — Dashboard.tsx parse để hiện
  // lại dữ liệu gốc thay vì chỉ 1 tên đã resolve, tránh nhầm lẫn khi 2 người trùng tên hiển thị.
  participant_extra_data: string | null;
  prize_name: string;
  prize_code: string | null;
  prize_display_image: string | null;
  drawn_at: string;
  rng_seed: string;
}

// Toàn bộ lịch sử quay (kể cả confirmed = 0 — đã pick nhưng bị Redo/bỏ dở, không commit) — CHỈ dùng
// cho Dashboard (sessions:drawHistory). Khác DrawResultRow thường (sessions:results) là nguồn dữ liệu
// SỐNG cho Present Mode, luôn lọc sẵn confirmed = 1 ở phía main process — xem docs/architecture/
// draw-engine.md.
export interface DrawHistoryRow extends DrawResultRow {
  confirmed: 0 | 1;
}

// Ứng viên đã pickWinner() nhưng CHƯA commitDraw() — dùng cho luồng Button Draw/Confirm/Redo trên
// Landing Page (xem electron/drawEngine.ts:DrawCandidate, cùng shape, khai báo riêng cho renderer).
export interface DrawCandidate {
  participantId: string;
  participantName: string;
  prizeId: string;
  prizeName: string;
  seed: string;
}

declare global {
  interface Window {
    api: {
      participants: {
        list: (sessionId: string) => Promise<Participant[]>;
        stats: (sessionId: string) => Promise<{ original: number; current: number; removed: number }>;
        create: (
          data: Partial<Participant> & { sessionId: string; name: string; extra?: Record<string, string> }
        ) => Promise<string>;
        update: (data: {
          sessionId: string;
          id: string;
          name: string;
          code?: string | null;
          phone?: string | null;
          email?: string | null;
          extra?: Record<string, string>;
        }) => Promise<void>;
        bulkImport: (
          sessionId: string,
          rows: (Partial<Participant> & { extra?: Record<string, string> })[]
        ) => Promise<number>;
        delete: (sessionId: string, id: string) => Promise<void>;
        bulkDelete: (sessionId: string, ids: string[]) => Promise<number>;
        reorder: (sessionId: string, orderedIds: string[]) => Promise<void>;
      };
      prizes: {
        list: (sessionId: string) => Promise<Prize[]>;
        create: (data: {
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
          displayImage?: string | null;
        }) => Promise<string>;
        update: (data: {
          id: string;
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
          displayImage?: string | null;
        }) => Promise<void>;
        delete: (sessionId: string, id: string) => Promise<void>;
      };
      sessions: {
        list: () => Promise<Session[]>;
        listAll: () => Promise<SessionFileInfo[]>;
        get: (id: string) => Promise<Session | null>;
        create: (data: {
          name: string;
          allowDuplicatePrize?: boolean;
          excludePreviousWinners?: boolean;
        }) => Promise<string>;
        rename: (data: { id: string; name: string }) => Promise<void>;
        // Khoá bị từ chối (ok: false) khi session còn mở cửa sổ phụ — openWindows = tên các cửa sổ cần đóng.
        setLocked: (data: { id: string; locked: 0 | 1 | 2 }) => Promise<{ ok: boolean; openWindows: string[] }>;
        updateOptions: (data: {
          id: string;
          allowDuplicatePrize: boolean;
          excludePreviousWinners: boolean;
        }) => Promise<void>;
        updateColumnTypes: (data: { id: string; columnTypes: Record<string, string> }) => Promise<void>;
        updateColumnLabels: (data: { id: string; columnLabels: Record<string, string> }) => Promise<void>;
        updateLandingConfig: (data: { id: string; landingConfig: LandingConfig }) => Promise<void>;
        delete: (id: string) => Promise<void>;
        results: (sessionId: string) => Promise<DrawResultRow[]>;
        drawHistory: (sessionId: string) => Promise<DrawHistoryRow[]>;
        // Mỗi session = 1 file trong data/ — session có ≥ 2 bản (cùng id, khác file) chờ người dùng chọn
        // giữ bản nào (xem electron/db.ts, SessionConflictDialog.tsx).
        conflicts: () => Promise<SessionConflict[]>;
        resolveConflict: (data: { sessionId: string; keepFile: string }) => Promise<void>;
        // Giữ mọi bản, cấp id mới cho bản `file` → session riêng. Trả về id mới.
        keepBothConflict: (data: { sessionId: string; file: string }) => Promise<string>;
        openDataFolder: () => Promise<string>;
        // Session đã bị Delete (data/.trash/, khác Close) — xem RestoreModal.tsx.
        listTrash: () => Promise<TrashEntry[]>;
        restoreFromTrash: (data: { file: string }) => Promise<void>;
        // "Close" (nút ×) — chỉ ẩn khỏi sessions:list, KHÁC "Delete" (sessions:delete, chuyển vào trash).
        setClosed: (data: { id: string; closed: boolean }) => Promise<void>;
        // Kéo-thả đổi thứ tự tab — ids = mọi tab đang hiện theo thứ tự mới, lưu ở data/.tab-order.json.
        setTabOrder: (ids: string[]) => Promise<void>;
        // Nhân bản session → id mới ("<tên> copy"), sạch kết quả quay, mở khoá, tab nằm ngay sau tab gốc.
        duplicate: (id: string) => Promise<string>;
      };
      auth: {
        // null = chưa đăng nhập — renderer hiện <Login/> (xem <RequireAuth> trong src/App.tsx).
        getSession: () => Promise<PublicSession | null>;
        // Địa chỉ Worker cố định theo môi trường ở main process (electron/config/cloudEnv.ts).
        login: (data: { username: string; password: string }) => Promise<AuthResult<LoginResult>>;
        // Lần đầu (chưa kích hoạt): Access Code (= secret ADMIN_TOKEN của Worker) + tạo admin → đăng nhập luôn.
        // Bước 1 màn kích hoạt: chỉ kiểm tra Access Code (chưa tạo gì).
        verifyAccessCode: (accessCode: string) => Promise<AuthResult<{ ok: true }>>;
        activate: (data: { accessCode: string; username: string; password: string }) => Promise<AuthResult<LoginResult>>;
        // Quên mật khẩu admin — trả lại username admin.
        resetAdminPassword: (data: { accessCode: string; password: string }) => Promise<AuthResult<{ username: string }>>;
        getStartupStatus: () => Promise<StartupStatus>;
        // Nút Retry ở màn "No internet connection".
        retryStartup: () => Promise<StartupStatus>;
        logout: () => Promise<AuthResult<{ ok: true }>>;
        // Người dùng chọn Import ở hộp thoại "Tìm thấy N session trên máy này" (LoginResult.looseFiles).
        importLooseFiles: (files: string[]) => Promise<AuthResult<{ imported: number }>>;
        // 4 hàm dưới CHỈ dùng được khi getSession().isAdmin === true (Worker tự chặn 403 nếu không).
        createAccount: (data: { username: string; password: string }) => Promise<AuthResult<{ accountId: string; username: string }>>;
        listAccounts: () => Promise<AuthResult<{ accounts: AccountRow[] }>>;
        // Admin đặt mật khẩu mới cho 1 account (team quên mật khẩu).
        resetAccountPassword: (data: { accountId: string; password: string }) => Promise<AuthResult<{ ok: true }>>;
        // Admin: mọi session của 1 account (tình trạng, dung lượng cloud) + khôi phục session đã xoá hình thức.
        listAccountSessions: (accountId: string) => Promise<AuthResult<{ sessions: AdminSessionRow[] }>>;
        restoreDeletedSession: (data: { accountId: string; sessionId: string }) => Promise<AuthResult<{ ok: true }>>;
        // Nhả khoá phiên của account đó NGAY, không cần đợi 90s nguội.
        forceLogoutAccount: (accountId: string) => Promise<AuthResult<{ ok: true }>>;
        setAccountDisabled: (data: { accountId: string; disabled: boolean }) => Promise<AuthResult<{ ok: true; disabled: boolean }>>;
        // Phiên bị thu hồi thật (401 — đăng nhập nơi khác), KHÁC mất mạng tạm thời (onConnectivityChange).
        onRevoked: (cb: () => void) => () => void;
        // true = vừa mất kết nối tạm thời (renderer hiện popup "Reconnecting..."), false = đã lại —
        // KHÔNG phải đăng xuất, không đóng cửa sổ phụ nào (app chạy live tại sự kiện).
        onConnectivityChange: (cb: (offline: boolean) => void) => () => void;
      };
      sync: {
        getStatuses: () => Promise<Record<string, SyncStatus>>;
        // Điểm chốt từ renderer (chuyển/mở tab) — kiểm tra cloud rồi Push/Pull nếu cần.
        session: (sessionId: string) => Promise<void>;
        // Nút Refresh trong SessionsModal — tải session cloud mà máy chưa có + kiểm tra mọi session.
        all: () => Promise<void>;
        onStatus: (cb: (data: { sessionId: string; status: SyncStatus }) => void) => () => void;
        onSessionsChanged: (cb: () => void) => () => void;
      };
      draw: {
        one: (sessionId: string) => Promise<DrawCandidate>;
        pick: (data: {
          sessionId: string;
          excludeParticipantIds?: string[];
          lockedPrizeId?: string;
        }) => Promise<DrawCandidate>;
        commit: (data: { candidate: DrawCandidate; sessionId: string }) => Promise<void>;
        resetSession: (sessionId: string) => Promise<void>;
      };
      present: {
        open: (sessionId: string) => Promise<void>;
        toggleFullscreen: () => Promise<boolean>;
        onFullscreenChange: (cb: (isFullscreen: boolean) => void) => () => void;
      };
      landingBuilder: {
        open: (sessionId: string) => Promise<void>;
        reportDirty: (dirty: boolean) => void;
      };
      dataEditor: {
        open: (sessionId: string) => Promise<void>;
      };
      dialog: {
        openAndReadFile: () => Promise<{ ext: string; text?: string; base64?: string; error?: string } | null>;
        // Hộp thoại Save + ghi file (xem src/lib/exportTable.ts). null = người dùng huỷ dialog.
        saveFile: (data: {
          defaultName: string;
          ext: "csv" | "xlsx";
          text?: string;
          base64?: string;
        }) => Promise<{ filePath: string } | { error: string } | null>;
      };
      media: {
        // null = người dùng huỷ dialog. Phát lại qua `ldmedia://<sessionId>/<mediaId>` (electron/media.ts).
        importVideo: (
          sessionId: string
        ) => Promise<{ mediaId: string; fileName: string; size: number } | { error: string } | null>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      editor: {
        reportDirty: (dirty: boolean) => void;
      };
    };
  }
}
