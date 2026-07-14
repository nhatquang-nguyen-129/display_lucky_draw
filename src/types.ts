export interface Participant {
  id: string;
  session_id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  extra_data: string | null; // JSON string chứa các cột optional (vd facebook_post, note)
  source: string;
  status: string;
  created_at: string;
}

export interface Prize {
  id: string;
  session_id: string;
  name: string;
  quantity: number;
  remaining: number;
  weight: number;
  image_path: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  name: string;
  allow_duplicate_prize: 0 | 1;
  exclude_previous_winners: 0 | 1;
  status: string;
  landing_config: string | null;
  created_at: string;
}

export interface DrawResultRow {
  id: string;
  session_id: string;
  participant_id: string;
  prize_id: string;
  participant_name: string;
  prize_name: string;
  drawn_at: string;
  rng_seed: string;
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
      };
      prizes: {
        list: (sessionId: string) => Promise<Prize[]>;
        create: (data: { sessionId: string; name: string; quantity: number; weight: number }) => Promise<string>;
        delete: (id: string) => Promise<void>;
      };
      sessions: {
        list: () => Promise<Session[]>;
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
        delete: (id: string) => Promise<void>;
        results: (sessionId: string) => Promise<DrawResultRow[]>;
      };
      draw: {
        one: (sessionId: string) => Promise<{
          participantId: string;
          participantName: string;
          prizeId: string;
          prizeName: string;
          seed: string;
        }>;
      };
      present: {
        open: (sessionId: string) => Promise<void>;
      };
      dialog: {
        openAndReadFile: () => Promise<{ ext: string; text?: string; base64?: string } | null>;
      };
    };
  }
}
