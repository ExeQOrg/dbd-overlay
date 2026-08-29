import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function MainLayout() {
  return (
    <div className="flex h-screen w-screen bg-[#f6f6f6] text-[#0f0f0f] dark:bg-[#2f2f2f] dark:text-[#f6f6f6]">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
