import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard", icon: "grid" },
  { to: "/participants", label: "Participants", icon: "users" },
  { to: "/prizes", label: "Prizes", icon: "gift" },
  { to: "/landing", label: "Draw", icon: "layout" },
  { to: "/help", label: "Help", icon: "help" },
];

const icons: Record<string, JSX.Element> = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15.5 14c2.6.4 4.5 2.7 4.5 5.5" />
    </svg>
  ),
  gift: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="9" width="18" height="4" rx="1" />
      <rect x="5" y="13" width="14" height="8" rx="1" />
      <path d="M12 9v12" />
      <path d="M12 9c-1.5-3-3.5-4-4.7-2.8C6 7.5 7.5 9 12 9Z" />
      <path d="M12 9c1.5-3 3.5-4 4.7-2.8C18 7.5 16.5 9 12 9Z" />
    </svg>
  ),
  layout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M3 9h18" />
      <path d="M9 9v12" />
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.2a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.2 1-1.2 1.9v.3" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
};

export default function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-base-800 bg-base-900 px-4 py-6">
      <div className="mb-8 px-2">
        <p className="font-display text-lg font-medium text-base-100">Lucky Draw</p>
        <p className="text-xs text-base-400">Event management studio</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-base-800 text-gold-400"
                  : "text-base-300 hover:bg-base-800/60 hover:text-base-100"
              }`
            }
          >
            <span className="h-4 w-4">{icons[item.icon]}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
