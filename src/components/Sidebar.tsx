import { useState } from "react";
import { NavLink } from "react-router-dom";
import Modal from "./Modal";
import Button from "./Button";
import { BusyIndicator } from "./Spinner";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/participants", label: "Participants" },
  { to: "/prizes", label: "Prizes" },
  { to: "/landing", label: "Draw" },
  { to: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const [loggingOut, setLoggingOut] = useState(false);
  // Popup xác nhận Log out trong app — KHÔNG dùng window.confirm(): trên Windows, sau khi hộp thoại native
  // của trình duyệt đóng, Electron hay làm trang mất focus bàn phím → màn Sign in hiện ra nhưng không gõ
  // được vào ô Username/Password cho tới khi cửa sổ được focus lại (lỗi đã gặp thật).
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await window.api.auth.logout();
      // Reload — gọn nhất để toàn bộ renderer (SessionContext, danh sách tab...) khởi động lại sạch
      // theo trạng thái "chưa đăng nhập" (<RequireAuth> trong src/App.tsx sẽ tự hiện màn Login).
      window.location.reload();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-base-800 bg-base-900 px-4 py-6">
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-base-800 text-gold-400"
                  : "text-base-300 hover:bg-base-800/60 hover:text-base-100"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Đăng xuất account đang dùng trên máy này (xem electron/auth.ts) — nằm dưới cùng menu trái. */}
      <button
        onClick={() => setConfirmLogout(true)}
        disabled={loggingOut}
        title="Log out of this account"
        className="rounded-lg px-3 py-2.5 text-left text-sm text-danger-500 transition-colors hover:bg-danger-500/10 disabled:opacity-50"
      >
        Log out
      </button>

      {confirmLogout && (
        <Modal
          open
          title="Log out?"
          onClose={() => !loggingOut && setConfirmLogout(false)}
          maxWidth="max-w-[16rem]"
          hideCloseButton
          scroll={false}
        >
          <div className="flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmLogout(false)} disabled={loggingOut} className="w-24">
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleLogout} disabled={loggingOut} className="w-24">
              Log out
            </Button>
          </div>
          <BusyIndicator busy={loggingOut} />
        </Modal>
      )}
    </aside>
  );
}
