import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DataEditorModal from "@/components/DataEditorModal";
import { Session } from "@/types";

// Cửa sổ phụ chứa Data Editor — tách riêng khỏi cửa sổ chính, giống hệt Landing Builder/Present Mode
// (xem LandingBuilderWindow.tsx/PresentMode.tsx). Không dùng SessionContext vì đây là route NGOÀI
// <Layout> (xem App.tsx) — tự fetch session qua sessions:get, KHÔNG có SessionProvider nào để gọi
// useSession() (đã gặp thật lúc thử tái dùng DataEditorModal.tsx nguyên bản — nó từng tự gọi
// useSession() bên trong, throw ngay "useSession() must be called inside a <SessionProvider>" khi
// mount ở đây). DataEditorModal.tsx đã đổi sang nhận `onSessionRefresh` qua prop thay vì tự đọc
// context — file này chính là nơi định nghĩa "refresh nghĩa là gì" cho trường hợp cửa sổ riêng: refetch
// lại ĐÚNG 1 session của mình qua sessions:get, không phải refresh cả danh sách sessions như context cũ.
// Không có prop/nút "đóng" nào ở đây — DataEditorModal.tsx render FULL cửa sổ (giống Landing Builder),
// đóng qua chính khung cửa sổ thật, guard "còn thay đổi chưa lưu" nằm ở main process
// (electron/main.ts's openDataEditorWindow), không phải React.
export default function DataEditorWindow() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);

  const loadSession = useCallback(() => {
    if (!sessionId) return;
    window.api.sessions.get(sessionId).then(setSession);
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  if (!sessionId || !session) {
    return <div className="flex h-screen items-center justify-center bg-base-950 text-sm text-base-400">Loading…</div>;
  }

  return <DataEditorModal open sessionId={sessionId} session={session} onSaved={() => {}} onSessionRefresh={loadSession} />;
}
