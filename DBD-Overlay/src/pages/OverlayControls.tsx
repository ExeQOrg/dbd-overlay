import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Anchor,
  DEFAULT_OVERLAY_SETTINGS,
  loadOverlaySettings,
  saveOverlaySettings,
  OverlaySettings,
} from "../lib/overlaySettings";

const anchorOptions: { value: Anchor; label: string }[] = [
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
];

export default function OverlayControls() {
  const [visible, setVisible] = useState(true);
  const [settings, setSettings] = useState<OverlaySettings>(() => loadOverlaySettings());

  useEffect(() => {
    const overlay = WebviewWindow.getByLabel("overlay");
    overlay?.then((win) => win?.isVisible().then(setVisible));
  }, []);

  function updateSettings(patch: Partial<OverlaySettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveOverlaySettings(next);
    emit("update-overlay-settings", next);
  }

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

  async function openPopout() {
    await invoke("open_obs_popout");
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
        <button
          onClick={openPopout}
          className="rounded-lg bg-[#2e8b57] px-5 py-2.5 text-base font-medium text-white shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
        >
          Popout OBS Overlay
        </button>
      </div>

      <div className="mt-8 flex w-full max-w-[320px] flex-col gap-6 text-left">
        <label className="flex flex-col gap-2">
          <span className="flex justify-between text-sm font-medium">
            <span>Image size</span>
            <span>{settings.size}px</span>
          </span>
          <input
            type="range"
            min={50}
            max={600}
            step={10}
            value={settings.size}
            onChange={(e) => updateSettings({ size: Number(e.currentTarget.value) })}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex justify-between text-sm font-medium">
            <span>Opacity</span>
            <span>{Math.round(settings.opacity * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.opacity * 100)}
            onChange={(e) => updateSettings({ opacity: Number(e.currentTarget.value) / 100 })}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Anchor</span>
          <select
            value={settings.anchor}
            onChange={(e) => updateSettings({ anchor: e.currentTarget.value as Anchor })}
            className="rounded-lg border border-transparent bg-white px-3 py-2 text-sm shadow-[0_2px_2px_rgba(0,0,0,0.2)] dark:bg-[#0f0f0f98] dark:text-white"
          >
            {anchorOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => updateSettings(DEFAULT_OVERLAY_SETTINGS)}
          className="self-start text-sm text-[#396cd8] underline"
        >
          Reset to defaults
        </button>
      </div>
    </main>
  );
}
