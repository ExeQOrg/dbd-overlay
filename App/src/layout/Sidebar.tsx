import { NavLink } from "react-router-dom";
import packageJson from "../../package.json";

const tabs = [
  { to: "/gallery", label: "Gallery" },
  { to: "/controls", label: "Overlay" },
  { to: "/detect", label: "Detect" },
];

const linkBase =
  "flex w-full items-center justify-center rounded px-2 py-3 text-center font-display text-sm uppercase tracking-wide transition-colors";
const linkInactive = "text-bone/55 hover:bg-bone/10 hover:text-bone";
const linkActive = "bg-blood text-bone shadow-sm";

export default function Sidebar() {
  return (
    <nav className="relative flex h-screen w-20 shrink-0 flex-col justify-between border-r border-black/40 bg-fog-dark py-4">
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
        <p className="mt-2 text-center font-mono text-[10px] text-bone/50">
          v{packageJson.version}
        </p>
      </div>
    </nav>
  );
}
