import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useDetection } from "../lib/DetectionContext";
import { getCreators } from "../lib/Gallery";
import {
  DEFAULT_GLOBAL_SETTINGS,
  GlobalSettings,
  loadGlobalSettings,
  saveGlobalSettings,
} from "../lib/GlobalSettings";
import {
  Anchor,
  DEFAULT_OVERLAY_SETTINGS,
  loadOverlaySettings,
  saveOverlaySettings,
  OverlaySettings,
} from "../lib/OverlaySettings";
import { DEFAULT_DETECTION_SETTINGS } from "../lib/DetectionSettings";
import { keyEventToAccelerator, formatAccelerator } from "../lib/Shortcut";
import {
  pageClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  resetButtonClass,
  sliderLabelClass,
  sliderHeaderClass,
} from "../lib/Styles";
import ResetButton from "../components/ResetButton";
import PageHeading from "../components/PageHeading";
import Accordion from "../components/Accordion";

const anchorOptions: { value: Anchor; label: string }[] = [
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
];

export default function GlobalSettingsPage() {
  const {
    images,
    settings: detectionSettings,
    windows,
    refreshWindows,
    updateSettings: updateDetectionSettings,
    addRegion,
    updateRegion,
    removeRegion,
    setScanShortcut,
  } = useDetection();

  const [settings, setSettings] = useState<GlobalSettings>(() => loadGlobalSettings());
  const creators = getCreators(images);

  // Only known once is_portable() resolves - stays null (and the button
  // hidden) until then so it doesn't flash for portable users.
  const [isPortable, setIsPortable] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<boolean>("is_portable")
      .then(setIsPortable)
      .catch(() => setIsPortable(false));
  }, []);

  type UpdateStatus =
    | { state: "idle" }
    | { state: "checking" }
    | { state: "up-to-date" }
    | { state: "available"; update: Update }
    | { state: "installing" }
    | { state: "error"; message: string };

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: "idle" });

  async function checkForUpdates() {
    setUpdateStatus({ state: "checking" });
    try {
      const update = await check();
      setUpdateStatus(update ? { state: "available", update } : { state: "up-to-date" });
    } catch (err) {
      setUpdateStatus({ state: "error", message: String(err) });
    }
  }

  async function installUpdate(update: Update) {
    setUpdateStatus({ state: "installing" });
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setUpdateStatus({ state: "error", message: String(err) });
    }
  }

  function updateSettings(patch: Partial<GlobalSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveGlobalSettings(next);
  }

  // --- Overlay ---
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(() => loadOverlaySettings());

  function updateOverlaySettings(patch: Partial<OverlaySettings>) {
    const next = { ...overlaySettings, ...patch };
    setOverlaySettings(next);
    saveOverlaySettings(next);
    emit("update-overlay-settings", next);
  }

  // --- Detect ---
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingShortcut) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecordingShortcut(false);
        return;
      }

      const accelerator = keyEventToAccelerator(e);
      if (!accelerator) return; // still only modifiers held, or an unsupported key

      if (!accelerator.includes("+")) {
        setShortcutError("Include a modifier key (Ctrl, Alt, or Shift) with it.");
        return;
      }

      setRecordingShortcut(false);
      setShortcutError(null);
      setScanShortcut(accelerator).catch((err) => setShortcutError(String(err)));
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recordingShortcut, setScanShortcut]);

  // Mirrors the case-insensitive substring match capture_screen_region uses,
  // so the picker shows the live window that's actually being captured
  // rather than requiring its title to equal the saved pattern verbatim.
  const matchedWindow = windows.find((w) =>
    w.title.toLowerCase().includes(detectionSettings.windowTitle.toLowerCase())
  );
  const windowSelectValue = matchedWindow ? matchedWindow.title : detectionSettings.windowTitle;

  return (
    <main className={pageClass}>
      <PageHeading>Settings</PageHeading>

      <div className="flex w-full max-w-[480px] flex-col gap-6 text-left">
        {isPortable === false && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Updates</p>
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={
                updateStatus.state === "checking" ||
                updateStatus.state === "installing" ||
                updateStatus.state === "available"
              }
              className={`w-full ${secondaryButtonClass}`}
            >
              {updateStatus.state === "checking"
                ? "Checking…"
                : updateStatus.state === "installing"
                  ? "Installing update…"
                  : "Check for Updates"}
            </button>
            {updateStatus.state === "up-to-date" && (
              <p className="mt-2 text-xs text-ink/70">You're on the latest version.</p>
            )}
            {updateStatus.state === "error" && (
              <p className="mt-2 text-xs text-blood">{updateStatus.message}</p>
            )}
            {updateStatus.state === "available" && (
              <div className="mt-2 rounded border border-ink/10 p-3">
                <p className="text-sm font-medium text-ink">
                  Version {updateStatus.update.version} is available
                </p>
                {updateStatus.update.body && (
                  <p className="mt-1 whitespace-pre-line text-xs text-ink/70">
                    {updateStatus.update.body}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => installUpdate(updateStatus.update)}
                    className={`flex-1 ${primaryButtonClass}`}
                  >
                    Update Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateStatus({ state: "idle" })}
                    className={`flex-1 ${secondaryButtonClass}`}
                  >
                    Later
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 flex items-center justify-between text-sm font-medium text-ink">
            <span>Preferred creator</span>
            <ResetButton
              onClick={() => updateSettings({ preferredCreator: DEFAULT_GLOBAL_SETTINGS.preferredCreator })}
              disabled={settings.preferredCreator === DEFAULT_GLOBAL_SETTINGS.preferredCreator}
            />
          </p>
          <select
            value={settings.preferredCreator}
            onChange={(e) => updateSettings({ preferredCreator: e.currentTarget.value })}
            className={`w-full ${fieldClass}`}
          >
            <option value="">Any creator</option>
            {creators.map((creator) => (
              <option key={creator} value={creator}>
                {creator}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-ink/70">
            Used as the default creator filter on the Gallery page, and to prefer this creator's
            version of a map when detection finds it shared by multiple creators.
          </p>
        </div>

        <Accordion title="Overlay">
          <div className="flex flex-col gap-6">
            <label className={sliderLabelClass}>
              <span className={sliderHeaderClass}>
                <span>Image size</span>
                <span className="flex items-center gap-2">
                  {overlaySettings.size}px
                  <ResetButton
                    onClick={() => updateOverlaySettings({ size: DEFAULT_OVERLAY_SETTINGS.size })}
                    disabled={overlaySettings.size === DEFAULT_OVERLAY_SETTINGS.size}
                  />
                </span>
              </span>
              <input
                type="range"
                min={50}
                max={600}
                step={10}
                value={overlaySettings.size}
                onChange={(e) => updateOverlaySettings({ size: Number(e.currentTarget.value) })}
              />
            </label>

            <label className={sliderLabelClass}>
              <span className={sliderHeaderClass}>
                <span>Opacity</span>
                <span className="flex items-center gap-2">
                  {Math.round(overlaySettings.opacity * 100)}%
                  <ResetButton
                    onClick={() => updateOverlaySettings({ opacity: DEFAULT_OVERLAY_SETTINGS.opacity })}
                    disabled={overlaySettings.opacity === DEFAULT_OVERLAY_SETTINGS.opacity}
                  />
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(overlaySettings.opacity * 100)}
                onChange={(e) => updateOverlaySettings({ opacity: Number(e.currentTarget.value) / 100 })}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="flex items-center justify-between text-sm font-medium">
                <span>Anchor</span>
                <ResetButton
                  onClick={() => updateOverlaySettings({ anchor: DEFAULT_OVERLAY_SETTINGS.anchor })}
                  disabled={overlaySettings.anchor === DEFAULT_OVERLAY_SETTINGS.anchor}
                />
              </span>
              <select
                value={overlaySettings.anchor}
                onChange={(e) => updateOverlaySettings({ anchor: e.currentTarget.value as Anchor })}
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
        </Accordion>

        <Accordion title="Detect">
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-2 flex items-center justify-between text-sm font-medium text-ink">
                <span>Manual scan shortcut</span>
                <ResetButton
                  onClick={() =>
                    setScanShortcut(DEFAULT_DETECTION_SETTINGS.scanShortcut).catch((err) =>
                      setShortcutError(String(err))
                    )
                  }
                  disabled={detectionSettings.scanShortcut === DEFAULT_DETECTION_SETTINGS.scanShortcut}
                />
              </p>
              <button
                type="button"
                onClick={() => {
                  setShortcutError(null);
                  setRecordingShortcut(true);
                }}
                className={`w-full text-left ${fieldClass} ${recordingShortcut ? "text-blood" : ""}`}
              >
                {recordingShortcut
                  ? "Press a key combo… (Esc to cancel)"
                  : formatAccelerator(detectionSettings.scanShortcut)}
              </button>
              {shortcutError && <p className="mt-2 text-xs text-blood">{shortcutError}</p>}
              <p className="mt-2 text-xs text-ink/70">
                Triggers a scan globally, even while the game is focused.
              </p>
            </div>

            <div>
              <p className="mb-2 flex items-center justify-between text-sm font-medium text-ink">
                <span>Capture window</span>
                <ResetButton
                  onClick={() => updateDetectionSettings({ windowTitle: DEFAULT_DETECTION_SETTINGS.windowTitle })}
                  disabled={detectionSettings.windowTitle === DEFAULT_DETECTION_SETTINGS.windowTitle}
                />
              </p>
              <div className="flex gap-2">
                <select
                  value={windowSelectValue}
                  onChange={(e) => updateDetectionSettings({ windowTitle: e.currentTarget.value })}
                  className={`w-full ${fieldClass}`}
                >
                  <option value="">Select a window…</option>
                  {detectionSettings.windowTitle && !matchedWindow && (
                    <option value={detectionSettings.windowTitle}>
                      {detectionSettings.windowTitle} (not running)
                    </option>
                  )}
                  {windows.map((w) => (
                    <option key={w.title} value={w.title}>
                      {w.title} ({w.appName})
                    </option>
                  ))}
                </select>
                <button
                  onClick={refreshWindows}
                  className="shrink-0 rounded bg-fog-dark px-4 py-2 text-sm font-display uppercase tracking-wide text-bone shadow-sm transition-colors hover:bg-ink"
                >
                  Refresh
                </button>
              </div>
              <p className="mt-2 text-xs text-ink/70">
                Detection matches this automatically once the game is running - you only need to
                change it here if the wrong window gets picked up.
              </p>
            </div>

            <div>
              <p className="mb-2 flex items-center justify-between text-sm font-medium text-ink">
                <span>Scan regions (% of window)</span>
                <ResetButton
                  onClick={() => updateDetectionSettings({ regions: DEFAULT_DETECTION_SETTINGS.regions })}
                  disabled={
                    detectionSettings.regions.length === DEFAULT_DETECTION_SETTINGS.regions.length &&
                    detectionSettings.regions.every((r, i) => {
                      const d = DEFAULT_DETECTION_SETTINGS.regions[i];
                      return r.x === d.x && r.y === d.y && r.width === d.width && r.height === d.height;
                    })
                  }
                />
              </p>
              <div className="flex flex-col gap-3">
                {detectionSettings.regions.map((region, index) => (
                  <div key={index} className="rounded border border-ink/10 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-ink/60">
                        Region {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRegion(index)}
                        disabled={detectionSettings.regions.length <= 1}
                        className={resetButtonClass}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1 text-sm text-ink">
                        X
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(region.x * 100)}
                          onChange={(e) => updateRegion(index, { x: Number(e.currentTarget.value) / 100 })}
                          className={fieldClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm text-ink">
                        Y
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(region.y * 100)}
                          onChange={(e) => updateRegion(index, { y: Number(e.currentTarget.value) / 100 })}
                          className={fieldClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm text-ink">
                        Width
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={Math.round(region.width * 100)}
                          onChange={(e) => updateRegion(index, { width: Number(e.currentTarget.value) / 100 })}
                          className={fieldClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm text-ink">
                        Height
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={Math.round(region.height * 100)}
                          onChange={(e) => updateRegion(index, { height: Number(e.currentTarget.value) / 100 })}
                          className={fieldClass}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addRegion} className={`mt-3 w-full ${secondaryButtonClass}`}>
                Add Region
              </button>
              <p className="mt-2 text-xs text-ink/70">
                Relative to the top-left of the selected window. Each region is captured and OCR'd
                separately on scan - tune them with the previews on the Detect page.
              </p>
            </div>

            <label className={sliderLabelClass}>
              <span className={sliderHeaderClass}>
                <span>Match threshold</span>
                <span className="flex items-center gap-2">
                  {Math.round(detectionSettings.threshold * 100)}%
                  <ResetButton
                    onClick={() => updateDetectionSettings({ threshold: DEFAULT_DETECTION_SETTINGS.threshold })}
                    disabled={detectionSettings.threshold === DEFAULT_DETECTION_SETTINGS.threshold}
                  />
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(detectionSettings.threshold * 100)}
                onChange={(e) => updateDetectionSettings({ threshold: Number(e.currentTarget.value) / 100 })}
              />
            </label>

            <label className={sliderLabelClass}>
              <span className={sliderHeaderClass}>
                <span>Brightness threshold</span>
                <span className="flex items-center gap-2">
                  {detectionSettings.brightnessThreshold}
                  <ResetButton
                    onClick={() =>
                      updateDetectionSettings({
                        brightnessThreshold: DEFAULT_DETECTION_SETTINGS.brightnessThreshold,
                      })
                    }
                    disabled={
                      detectionSettings.brightnessThreshold === DEFAULT_DETECTION_SETTINGS.brightnessThreshold
                    }
                  />
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={255}
                step={1}
                value={detectionSettings.brightnessThreshold}
                onChange={(e) => updateDetectionSettings({ brightnessThreshold: Number(e.currentTarget.value) })}
              />
              <p className="text-xs text-ink/70">
                Pixels brighter than this are kept as text, everything else is dropped to isolate the
                map name from the background. Lower it if scans miss text on a dim screen/HDR setup,
                raise it if the background is being picked up as text.
              </p>
            </label>

            <label className={sliderLabelClass}>
              <span className={sliderHeaderClass}>
                <span>Auto detect interval</span>
                <span className="flex items-center gap-2">
                  {detectionSettings.autoDetectInterval}s
                  <ResetButton
                    onClick={() =>
                      updateDetectionSettings({ autoDetectInterval: DEFAULT_DETECTION_SETTINGS.autoDetectInterval })
                    }
                    disabled={detectionSettings.autoDetectInterval === DEFAULT_DETECTION_SETTINGS.autoDetectInterval}
                  />
                </span>
              </span>
              <input
                type="range"
                min={1}
                max={60}
                step={1}
                value={detectionSettings.autoDetectInterval}
                onChange={(e) => updateDetectionSettings({ autoDetectInterval: Number(e.currentTarget.value) })}
              />
              <p className="text-xs text-ink/70">
                Time between automatic scans, measured from when the previous scan finishes - so a
                scan that runs long just pushes the next one back instead of overlapping it. Toggle
                auto detect on from the Gallery page.
              </p>
            </label>
          </div>
        </Accordion>
      </div>
    </main>
  );
}
