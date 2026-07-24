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
  created_at: string;
}

export interface DrawResultRow {
  id: string;
  session_id: string;
  participant_id: string;
  prize_id: string;
  participant_name: string;
  prize_name: string;
  prize_display_image: string | null;
  drawn_at: string;
  rng_seed: string;
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
        create: (
          data: Partial<Participant> & { sessionId: string; name: string; extra?: Record<string, string> }
        ) => Promise<string>;
        update: (data: {
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
        delete: (id: string) => Promise<void>;
        bulkDelete: (ids: string[]) => Promise<number>;
        reorder: (orderedIds: string[]) => Promise<void>;
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
        delete: (id: string) => Promise<void>;
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
        updateOptions: (data: {
          id: string;
          allowDuplicatePrize: boolean;
          excludePreviousWinners: boolean;
        }) => Promise<void>;
        updateColumnTypes: (data: { id: string; columnTypes: Record<string, string> }) => Promise<void>;
        updateDuplicateColumns: (data: { id: string; duplicateColumns: string[] }) => Promise<void>;
        updateLandingConfig: (data: { id: string; landingConfig: LandingConfig }) => Promise<void>;
        delete: (id: string) => Promise<void>;
        results: (sessionId: string) => Promise<DrawResultRow[]>;
      };
      draw: {
        one: (sessionId: string) => Promise<DrawCandidate>;
        pick: (data: {
          sessionId: string;
          excludeParticipantIds?: string[];
          lockedPrizeId?: string;
        }) => Promise<DrawCandidate>;
        commit: (data: { candidate: DrawCandidate; sessionId: string }) => Promise<void>;
      };
      present: {
        open: (sessionId: string) => Promise<void>;
      };
      landingBuilder: {
        open: (sessionId: string) => Promise<void>;
        reportDirty: (dirty: boolean) => void;
      };
      dialog: {
        openAndReadFile: () => Promise<{ ext: string; text?: string; base64?: string } | null>;
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
