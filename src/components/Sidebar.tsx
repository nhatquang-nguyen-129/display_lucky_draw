import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/participants", label: "Participants" },
  { to: "/prizes", label: "Prizes" },
  { to: "/landing", label: "Draw" },
  { to: "/settings", label: "Settings" },
];

export default function Sidebar() {
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
    </aside>
  );
}
