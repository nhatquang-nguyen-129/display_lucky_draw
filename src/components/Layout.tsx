import { useEffect, useState } from "react";
import { Outlet, useMatch } from "react-router-dom";
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";
import { SessionProvider } from "@/context/SessionContext";
import SessionConflictDialog from "./SessionConflictDialog";

// Mất mạng tạm thời (heartbeat fail, xem electron/auth.ts) — KHÁC bị thu hồi phiên (auth:revoked, quay
// về màn Login). Chỉ 1 dòng thông báo mỏng, không chặn gì, tự ẩn khi mạng có lại.
function ConnectivityBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => window.api.auth.onConnectivityChange(setOffline), []);
  if (!offline) return null;
  return (
    <div className="shrink-0 bg-highlight-500/10 px-3 py-1 text-center text-xs text-highlight-600">
      Reconnecting to the cloud... your changes are kept locally and will sync once back online.
    </div>
  );
}

export default function Layout() {
  // Landing Page Builder cần toàn bộ chiều rộng/cao cho canvas 3 cột — không dùng khung
  // max-w-6xl/padding như các trang form/bảng còn lại.
  const isFullBleed = useMatch("/landing");
  // Participants cần freeze thanh header (Data Editor/Import/Delete all) — trang tự chiếm đủ chiều
  // cao còn lại của main, chỉ bảng preview bên trong mới scroll (dọc lẫn ngang).
  const isFullHeight = useMatch("/participants");

  return (
    <SessionProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <ConnectivityBanner />
        <TabBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-base-950">
            {isFullBleed ? (
              <div className="h-full px-4 py-4">
                <Outlet />
              </div>
            ) : isFullHeight ? (
              <div className="mx-auto flex h-full max-w-6xl flex-col px-8 pb-8 pt-4">
                <Outlet />
              </div>
            ) : (
              <div className="mx-auto max-w-6xl px-8 pb-8 pt-4">
                <Outlet />
              </div>
            )}
          </main>
        </div>
      </div>
      <SessionConflictDialog />
    </SessionProvider>
  );
}
