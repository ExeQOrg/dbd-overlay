import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export default function OverlayControls() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const overlay = WebviewWindow.getByLabel("overlay");
    overlay?.then((win) => win?.isVisible().then(setVisible));
  }, []);

  async function toggleVisible() {
    const overlay = await WebviewWindow.getByLabel("overlay");
    if (!overlay) return;
    if (visible) {
      await overlay.hide();
    } else {
      await overlay.show();
    }
    setVisible(!visible);
  }

  async function clearOverlay() {
    await emit("update-content", {});
  }

  return (
    <main className="flex flex-col items-center px-8 pt-[10vh] text-center">
      <h1 className="mb-6 text-center">Overlay Controls</h1>

      <div className="flex flex-col gap-4">
        <button
          onClick={toggleVisible}
          className="rounded-lg bg-[#396cd8] px-5 py-2.5 text-base font-medium text-white shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
        >
          {visible ? "Hide Overlay" : "Show Overlay"}
        </button>
        <button
          onClick={clearOverlay}
          className="rounded-lg bg-[#888] px-5 py-2.5 text-base font-medium text-white shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
        >
          Clear Overlay Content
        </button>
      </div>
    </main>
  );
}
