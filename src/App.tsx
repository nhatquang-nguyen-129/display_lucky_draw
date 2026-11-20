import { ReactNode, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Participants from "./pages/Participants";
import Prizes from "./pages/Prizes";
import Settings from "./pages/Settings";
import PresentMode from "./pages/PresentMode";
import LandingPage from "./pages/LandingPage";
import LandingBuilderWindow from "./pages/LandingBuilderWindow";
import DataEditorWindow from "./pages/DataEditorWindow";
import Login from "./pages/Login";
import { PublicSession } from "@/types";

// Cổng đăng nhập cho CỬA SỔ CHÍNH — 3 cửa sổ phụ (Present/Landing Builder/Data Editor) không đi qua
// đây, vốn chỉ mở được TỪ cửa sổ chính (đã qua gate) nên không cần gate riêng (main.ts vẫn tự chặn
// phòng xa, xem present:open/landingBuilder:open/dataEditor:open trong electron/main.ts).
function RequireAuth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PublicSession | null | "loading">("loading");

  useEffect(() => {
    void window.api.auth.getSession().then(setSession);
    // Phiên bị thu hồi thật (401 — đăng nhập nơi khác, KHÁC mất mạng tạm thời) — quay lại màn Login.
    // KHÔNG đụng cửa sổ phụ nào (nếu đang mở Present/Builder/Editor, chúng là renderer process riêng,
    // vẫn chạy bình thường — xem electron/auth.ts).
    return window.api.auth.onRevoked(() => setSession(null));
  }, []);

  if (session === "loading") return null;
  if (!session) return <Login onSuccess={setSession} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Cửa sổ present mode: không có sidebar, chỉ render full-screen */}
      <Route path="/present/:sessionId" element={<PresentMode />} />

      {/* Cửa sổ Landing Builder: cửa sổ phụ riêng, cần toàn màn hình cho canvas */}
      <Route path="/landing-builder/:sessionId" element={<LandingBuilderWindow />} />

      {/* Cửa sổ Data Editor: cửa sổ phụ riêng, giống Landing Builder/Present Mode */}
      <Route path="/data-editor/:sessionId" element={<DataEditorWindow />} />

      {/* Cửa sổ chính: chưa đăng nhập thì chỉ thấy Login — dashboard đầy đủ nằm sau RequireAuth */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/participants" element={<Participants />} />
        <Route path="/prizes" element={<Prizes />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
