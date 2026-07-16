import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Participants from "./pages/Participants";
import Prizes from "./pages/Prizes";
import DrawSessionDetail from "./pages/DrawSessionDetail";
import Settings from "./pages/Settings";
import PresentMode from "./pages/PresentMode";

export default function App() {
  return (
    <Routes>
      {/* Cửa sổ present mode: không có sidebar, chỉ render full-screen */}
      <Route path="/present/:sessionId" element={<PresentMode />} />

      {/* Cửa sổ chính: dashboard đầy đủ, mọi trang đều theo tab (phiên) đang active */}
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/participants" element={<Participants />} />
        <Route path="/prizes" element={<Prizes />} />
        <Route path="/draw" element={<DrawSessionDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
