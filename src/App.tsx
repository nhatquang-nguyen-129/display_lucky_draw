import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Participants from "./pages/Participants";
import Prizes from "./pages/Prizes";
import DrawSessions from "./pages/DrawSessions";
import DrawSessionDetail from "./pages/DrawSessionDetail";
import Settings from "./pages/Settings";
import PresentMode from "./pages/PresentMode";

export default function App() {
  return (
    <Routes>
      {/* Cửa sổ present mode: không có sidebar, chỉ render full-screen */}
      <Route path="/present/:sessionId" element={<PresentMode />} />

      {/* Cửa sổ chính: dashboard đầy đủ */}
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/participants" element={<Participants />} />
        <Route path="/prizes" element={<Prizes />} />
        <Route path="/sessions" element={<DrawSessions />} />
        <Route path="/sessions/:sessionId" element={<DrawSessionDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
