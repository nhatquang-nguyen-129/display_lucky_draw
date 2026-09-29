import { createContext, useContext } from "react";

// Session đang hiển thị landing — CHỈ component cần gọi IPC/URL theo session mới đọc (hiện là Video:
// URL phát `ldmedia://<sessionId>/<mediaId>` và nút import trong VideoPanel.tsx). Cung cấp 1 lần ở
// trang gốc (PresentMode.tsx, LandingBuilderWindow.tsx, LandingPage.tsx) thay vì luồn prop qua
// LandingRenderer/LandingCanvas/PropertiesPanel.
export const LandingSessionContext = createContext<string | null>(null);

export function useLandingSessionId(): string | null {
  return useContext(LandingSessionContext);
}

export function mediaUrl(sessionId: string, mediaId: string): string {
  return `ldmedia://${sessionId}/${mediaId}`;
}
