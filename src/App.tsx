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
import Button from "./components/Button";
import AuthShell from "./components/AuthShell";
import { StartupStatus } from "@/types";

// Cổng đăng nhập cho CỬA SỔ CHÍNH — 3 cửa sổ phụ (Present/Landing Builder/Data Editor) không đi qua
// đây, vốn chỉ mở được TỪ cửa sổ chính (đã qua gate) nên không cần gate riêng (main.ts vẫn tự chặn
// phòng xa, xem present:open/landingBuilder:open/dataEditor:open trong electron/main.ts).
// App bắt buộc có mạng: mở app lúc không tới được server → màn "No internet connection" (Retry), không
// vào được app. Phiên đã lưu vẫn giữ — có mạng lại bấm Retry là vào luôn (xem auth.ts getStartupStatus).
function RequireAuth({ children }: { children: ReactNode }) {
  // logged-out kèm activated: false = chưa có admin trên Worker → màn kích hoạt bằng Access Code.
  const [gate, setGate] = useState<StartupStatus | "loading">("loading");
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      setGate(await window.api.auth.retryStartup());
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    void window.api.auth.getStartupStatus().then(setGate);
    // Phiên bị thu hồi thật (401/403 — đăng nhập nơi khác, Force logout, Disable; KHÁC mất mạng tạm thời)
    // — quay lại màn đăng nhập. KHÔNG đụng cửa sổ phụ nào (nếu đang mở Present/Builder/Editor, chúng là
    // renderer process riêng, vẫn chạy bình thường — xem electron/auth.ts).
    return window.api.auth.onRevoked(() => setGate({ status: "logged-out", activated: true }));
  }, []);

  if (gate === "loading") return null;
  if (gate.status === "offline") {
    return (
      <AuthShell>
        <div className="text-center">
          <h1 className="font-display text-xl font-semibold text-base-100">No internet connection</h1>
          <p className="mt-1.5 text-xs text-base-400">Lucky Draw Studio needs an internet connection to start. Check the connection and try again.</p>
          <Button onClick={retry} disabled={retrying} className="mt-6 w-full">
            {retrying ? "Connecting..." : "Retry"}
          </Button>
        </div>
      </AuthShell>
    );
  }
  if (gate.status === "logged-out") {
    return <Login activated={gate.activated} onSuccess={(session) => setGate({ status: "ok", session })} />;
  }
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
