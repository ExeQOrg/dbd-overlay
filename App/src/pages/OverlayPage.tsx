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
} from "../lib/OverlaySettings";
import { pageClass, fieldClass, buttonClass, primaryButtonClass, sliderLabelClass, sliderHeaderClass } from "../lib/Styles";
import ResetButton from "../components/ResetButton";

const anchorOptions: { value: Anchor; label: string }[] = [
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
];

export default function OverlayPage() {
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
    <main className={pageClass}>
      <h1 className="mb-6 text-center">Overlay Controls</h1>

      <div className="flex flex-col gap-4">
        <button onClick={toggleVisible} className={primaryButtonClass}>
          {visible ? "Hide Overlay" : "Show Overlay"}
        </button>
        <button onClick={clearOverlay} className={`${buttonClass} bg-[#888]`}>
          Clear Overlay Content
        </button>
        <button onClick={openPopout} className={`${buttonClass} bg-[#2e8b57]`}>
          Popout OBS Overlay
        </button>
      </div>

      <div className="mt-8 flex w-full max-w-[320px] flex-col gap-6 text-left">
        <label className={sliderLabelClass}>
          <span className={sliderHeaderClass}>
            <span>Image size</span>
            <span className="flex items-center gap-2">
              {settings.size}px
              <ResetButton
                onClick={() => updateSettings({ size: DEFAULT_OVERLAY_SETTINGS.size })}
                disabled={settings.size === DEFAULT_OVERLAY_SETTINGS.size}
              />
            </span>
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

        <label className={sliderLabelClass}>
          <span className={sliderHeaderClass}>
            <span>Opacity</span>
            <span className="flex items-center gap-2">
              {Math.round(settings.opacity * 100)}%
              <ResetButton
                onClick={() => updateSettings({ opacity: DEFAULT_OVERLAY_SETTINGS.opacity })}
                disabled={settings.opacity === DEFAULT_OVERLAY_SETTINGS.opacity}
              />
            </span>
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
          <span className="flex items-center justify-between text-sm font-medium">
            <span>Anchor</span>
            <ResetButton
              onClick={() => updateSettings({ anchor: DEFAULT_OVERLAY_SETTINGS.anchor })}
              disabled={settings.anchor === DEFAULT_OVERLAY_SETTINGS.anchor}
            />
          </span>
          <select
            value={settings.anchor}
            onChange={(e) => updateSettings({ anchor: e.currentTarget.value as Anchor })}
            className={fieldClass}
          >
            {anchorOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </main>
  );
}
