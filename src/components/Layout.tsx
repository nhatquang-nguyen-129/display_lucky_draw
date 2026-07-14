import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";
import { SessionProvider } from "@/context/SessionContext";

export default function Layout() {
  return (
    <SessionProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <TabBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-base-950">
            <div className="mx-auto max-w-6xl px-8 py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
