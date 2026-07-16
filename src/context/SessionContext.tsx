import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { Session } from "@/types";

interface SessionContextValue {
  sessions: Session[];
  activeSessionId: string | null;
  activeSession: Session | null;
  loading: boolean;
  switchTab: (id: string) => void;
  addTab: (name: string) => Promise<void>;
  renameTab: (id: string, name: string) => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Nhớ tab vừa dùng lần cuối để mở lại đúng tab đó khi khởi động app lần sau.
// Đây là localStorage của renderer Electron (không phải môi trường sandbox nào khác) nên dùng an toàn.
const LAST_ACTIVE_KEY = "lucky-draw:last-active-session";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await window.api.sessions.list();
    setSessions(list);
    setActiveSessionId((current) => {
      if (current && list.some((s) => s.id === current)) return current;
      const remembered = localStorage.getItem(LAST_ACTIVE_KEY);
      if (remembered && list.some((s) => s.id === remembered)) return remembered;
      return list[0]?.id ?? null;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (activeSessionId) localStorage.setItem(LAST_ACTIVE_KEY, activeSessionId);
  }, [activeSessionId]);

  const switchTab = useCallback((id: string) => setActiveSessionId(id), []);

  const addTab = useCallback(
    async (name: string) => {
      const id = await window.api.sessions.create({
        name,
        allowDuplicatePrize: false,
        excludePreviousWinners: true,
      });
      await refresh();
      setActiveSessionId(id);
    },
    [refresh]
  );

  const renameTab = useCallback(
    async (id: string, name: string) => {
      await window.api.sessions.rename({ id, name });
      await refresh();
    },
    [refresh]
  );

  const closeTab = useCallback(
    async (id: string) => {
      await window.api.sessions.delete(id);
      if (activeSessionId === id) setActiveSessionId(null);
      await refresh();
    },
    [activeSessionId, refresh]
  );

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  return (
    <SessionContext.Provider
      value={{ sessions, activeSessionId, activeSession, loading, switchTab, addTab, renameTab, closeTab, refresh }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession() phải được gọi bên trong <SessionProvider>");
  return ctx;
}
