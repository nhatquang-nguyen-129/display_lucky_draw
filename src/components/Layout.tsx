import { Outlet, useMatch } from "react-router-dom";
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";
import { SessionProvider } from "@/context/SessionContext";

export default function Layout() {
  // Landing Page Builder cần toàn bộ chiều rộng/cao cho canvas 3 cột — không dùng khung
  // max-w-6xl/padding như các trang form/bảng còn lại.
  const isFullBleed = useMatch("/landing");

  return (
    <SessionProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <TabBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-base-950">
            {isFullBleed ? (
              <div className="h-full px-4 py-4">
                <Outlet />
              </div>
            ) : (
              <div className="mx-auto max-w-6xl px-8 py-8">
                <Outlet />
              </div>
            )}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
