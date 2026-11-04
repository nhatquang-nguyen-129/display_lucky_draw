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
  // sessions:delete (chuyển vào data/.trash/). Xem sessions.setClosed/openFile, openDbFile() trong
  // electron/db.ts.
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

// Cloud Sync (Cloudflare Worker + R2) — xem electron/cloudSync.ts, docs/architecture/cloud-sync.md.
// Mọi lời gọi trả { error } thay vì throw, để modal hiện lỗi đọc được.
export type CloudResult<T> = { error: string } | T;
export interface CloudSettings {
  workerUrl: string;
  readCode: string;
  writeToken: string;
}
export interface CloudSpace {
  name: string;
  createdAt: string;
  role: "read" | "write";
}
export interface CloudVersion {
  sessionId: string;
  file: string;
  size: number;
  pushedAt: string; // ISO
  sessionName: string;
  modifiedAt: string; // ISO — lần sửa cuối của file gốc lúc Push
  sha256: string; // sha256 nội dung (bỏ qua schema cookie) — xem contentHash() trong cloudSync.ts
  appVersion: string;
  participantCount: number;
  pulledAs?: string; // đã Pull bản này về data/ (file vẫn còn)
}
// Trạng thái 1 session khi so local với cloud — xem status() trong electron/cloudSync.ts.
export type CloudSyncState = "in-sync" | "local-only" | "cloud-only" | "local-newer" | "cloud-newer" | "diverged";
export interface CloudSessionStatus {
  sessionId: string;
  name: string;
  state: CloudSyncState;
  newer?: "local" | "cloud"; // chỉ với "diverged": bên nào sửa sau
  local?: { modifiedAt: string; closed: boolean };
  versions: CloudVersion[]; // mới nhất trước, rỗng nếu local-only
}
export interface CloudPushResult {
  sessionId: string;
  name: string;
  status: "pushed" | "unchanged" | "error";
  message?: string;
}
export interface CloudPullResult {
  sessionId: string;
  name: string;
  status: "pulled" | "already-pulled" | "error";
  savedAs?: string;
  message?: string;
}
// Tiến độ Push/Pull đang chạy dở — bắn qua cloud:progress trong lúc main.ts còn đang xử lý, xem
// cloud.onProgress() trong window.api bên dưới.
export interface CloudProgress {
  sessionId: string;
  sent: number;
  total: number;
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
        // Xoá vĩnh viễn khỏi data/.trash/ — KHÔNG còn đường lấy lại, khác restoreFromTrash.
        permanentlyDelete: (data: { file: string }) => Promise<void>;
        // Nút "Open" — chọn 1 file .db bất kỳ, mở lại session đang Closed hoặc nạp session ở ngoài
        // data/ (USB, backup máy khác...). `alreadyOpen` = session này đã là 1 tab đang mở từ trước
        // (không phải tab Closed) — renderer báo rõ thay vì âm thầm switchTab. Xem openDbFile() trong
        // electron/db.ts.
        openFile: () => Promise<{ id: string; name: string; alreadyOpen: boolean } | null>;
        // "Close" (nút ×) — chỉ ẩn khỏi sessions:list, KHÁC "Delete" (sessions:delete, chuyển vào trash).
        setClosed: (data: { id: string; closed: boolean }) => Promise<void>;
        // Kéo-thả đổi thứ tự tab — ids = mọi tab đang hiện theo thứ tự mới, lưu ở data/.tab-order.json.
        setTabOrder: (ids: string[]) => Promise<void>;
        // Nhân bản session → id mới ("<tên> copy"), sạch kết quả quay, mở khoá, tab nằm ngay sau tab gốc.
        duplicate: (id: string) => Promise<string>;
      };
      cloud: {
        // URL Worker + mã đã lưu (data/.cloud-sync.json) — rỗng nếu chưa Connect lần nào.
        getSettings: () => Promise<CloudSettings>;
        // Kiểm tra URL + mã với Worker, đúng thì lưu lại. role "write" khi writeToken hợp lệ.
        connect: (data: CloudSettings) => Promise<CloudResult<CloudSpace>>;
        disconnect: () => Promise<void>;
        // So local với cloud từng session (gộp theo sessionId) — gợi ý Push/Sync theo `state`.
        status: () => Promise<CloudResult<{ sessions: CloudSessionStatus[]; canWrite: boolean }>>;
        // Đẩy từng session thành 1 bản mới; bản giống hệt bản mới nhất trên cloud → "unchanged".
        push: (sessionIds: string[]) => Promise<CloudResult<{ results: CloudPushResult[] }>>;
        // Tải 1 bản về data/ dưới tên tránh trùng — không ghi đè; trùng id → SessionConflictDialog.
        pull: (items: { sessionId: string; file: string }[]) => Promise<CloudResult<{ results: CloudPullResult[] }>>;
        // Nghe tiến độ Push/Pull đang chạy — trả về hàm huỷ đăng ký để component tự cleanup lúc unmount.
        onProgress: (cb: (p: CloudProgress) => void) => () => void;
        // Huỷ lượt Push/Pull đang chạy (đóng modal lúc busy, sau khi người dùng xác nhận).
        cancel: () => Promise<boolean>;
        // Main báo khi đóng cửa sổ chính mà còn session chưa Push — renderer tự mở Cloud Sync kèm nút
        // Force Exit. Trả về hàm huỷ đăng ký để component tự cleanup lúc unmount.
        onQuitPending: (cb: () => void) => () => void;
        // "Force Exit" trong Cloud Sync — bỏ qua cảnh báo, đóng cửa sổ chính thật sự.
        forceQuit: () => Promise<void>;
        // Main báo ngay sau khi vừa mở app xong mà có session lệch với cloud — renderer tự mở Cloud
        // Sync (gợi ý, không chặn gì). Trả về hàm huỷ đăng ký để component tự cleanup lúc unmount.
        onStartupPending: (cb: () => void) => () => void;
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
