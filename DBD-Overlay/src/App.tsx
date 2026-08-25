import { useState } from "react";
import { emit } from "@tauri-apps/api/event";
import reactLogo from "./assets/react.svg";
import "./App.css";

const logos = [
  { name: "Vite", src: "/vite.svg", href: "https://vite.dev", hover: "hover:drop-shadow-[0_0_2em_#747bff]" },
  { name: "Tauri", src: "/tauri.svg", href: "https://tauri.app", hover: "hover:drop-shadow-[0_0_2em_#24c8db]" },
  { name: "React", src: reactLogo, href: "https://react.dev", hover: "hover:drop-shadow-[0_0_2em_#61dafb]" },
];

function App() {
  const [search, setSearch] = useState("");
  const filtered = logos.filter((logo) =>
    logo.name.toLowerCase().includes(search.toLowerCase())
  );

  async function sendTestImage() {
    await emit("update-content", { imageUrl: reactLogo });
  }

  return (
    <main className="m-0 flex min-h-screen flex-col items-center bg-[#f6f6f6] pt-[10vh] text-center text-[#0f0f0f] dark:bg-[#2f2f2f] dark:text-[#f6f6f6]">
      <h1 className="mb-6 text-center">Welcome to Tauri + React</h1>

      <button
        onClick={sendTestImage}
        className="mb-6 rounded-lg bg-[#396cd8] px-5 py-2.5 text-base font-medium text-white shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
      >
        Send test image to overlay
      </button>

      <input
        className="mb-6 w-full max-w-[320px] rounded-lg border border-transparent bg-white px-5 py-2.5 text-base font-medium text-[#0f0f0f] shadow-[0_2px_2px_rgba(0,0,0,0.2)] outline-none transition-colors duration-200 focus:border-[#396cd8] dark:bg-[#0f0f0f98] dark:text-white"
        type="text"
        placeholder="Search logos..."
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      <div className="grid w-full max-w-[500px] grid-cols-3 gap-6">
        {filtered.map((logo) => (
          <a
            key={logo.name}
            href={logo.href}
            target="_blank"
            className={`flex flex-col items-center rounded-xl bg-white p-5 font-medium text-inherit no-underline shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)] dark:bg-[#0f0f0f98] ${logo.hover}`}
          >
            <img src={logo.src} className={`h-20 py-3 transition-[filter] duration-750`} alt={`${logo.name} logo`} />
            <span>{logo.name}</span>
          </a>
        ))}
        {filtered.length === 0 && <p className="col-span-full mt-4 text-[#888]">No logos match "{search}"</p>}
      </div>
    </main>
  );
}

export default App;
