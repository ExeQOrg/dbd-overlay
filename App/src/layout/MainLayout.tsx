import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

const grainStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
};

export default function MainLayout() {
  return (
    <div className="relative flex h-screen w-screen bg-fog text-ink">
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay" style={grainStyle} />
      <Sidebar />
      <div className="relative flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
