import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/gallery", label: "Gallery" },
  { to: "/controls", label: "Overlay" },
  { to: "/detect", label: "Detect" },
];

const linkBase =
  "flex w-full items-center justify-center rounded-lg px-2 py-3 text-center text-sm font-medium transition-colors";
const linkInactive =
  "text-[#0f0f0f]/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10";
const linkActive = "bg-[#396cd8] text-white";

export default function Sidebar() {
  return (
    <nav className="flex h-screen w-20 shrink-0 flex-col justify-between border-r border-black/10 bg-white py-4 dark:border-white/10 dark:bg-[#0f0f0f98]">
      <div className="flex flex-col gap-2 px-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkInactive}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div className="px-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkInactive}`
          }
        >
          Settings
        </NavLink>
      </div>
    </nav>
  );
}
