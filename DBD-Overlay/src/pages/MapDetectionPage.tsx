import { useDetection } from "../lib/DetectionContext";
import { DEFAULT_DETECTION_SETTINGS } from "../lib/DetectionSettings";
import { pageClass, fieldClass, primaryButtonClass, sliderLabelClass, sliderHeaderClass } from "../lib/Styles";
import ResetButton from "../components/ResetButton";

export default function MapDetectionPage() {
  const {
    settings,
    scanning,
    lastText,
    lastMatch,
    scanDuration,
    preview,
    error,
    windows,
    scanNow,
    refreshWindows,
    updateSettings,
  } = useDetection();

  const region = settings.region;

  // Mirrors the case-insensitive substring match capture_screen_region uses,
  // so the picker shows the live window that's actually being captured
  // rather than requiring its title to equal the saved pattern verbatim.
  const matchedWindow = windows.find((w) =>
    w.title.toLowerCase().includes(settings.windowTitle.toLowerCase())
  );
  const windowSelectValue = matchedWindow ? matchedWindow.title : settings.windowTitle;

  return (
    <main className={pageClass}>
      <h1 className="mb-6 text-center">Map Detection</h1>

      <button
        onClick={scanNow}
        disabled={scanning}
        className={`mb-2 ${primaryButtonClass} disabled:opacity-60`}
      >
        {scanning ? "Scanning…" : "Scan Now"}
      </button>
      <p className="mb-6 text-xs text-[#888]">Or press Ctrl+O anytime, even while the game is focused.</p>

      <div className="flex w-full max-w-[820px] flex-col gap-6 text-left lg:flex-row lg:items-start">
      <div className="flex w-full flex-col gap-6 lg:max-w-[360px]">
        <div>
          <p className="mb-2 flex items-center justify-between text-sm font-medium">
            <span>Capture window</span>
            <ResetButton
              onClick={() => updateSettings({ windowTitle: DEFAULT_DETECTION_SETTINGS.windowTitle })}
              disabled={settings.windowTitle === DEFAULT_DETECTION_SETTINGS.windowTitle}
            />
          </p>
          <div className="flex gap-2">
            <select
              value={windowSelectValue}
              onChange={(e) => updateSettings({ windowTitle: e.currentTarget.value })}
              className={`w-full ${fieldClass}`}
            >
              <option value="">Select a window…</option>
              {settings.windowTitle && !matchedWindow && (
                <option value={settings.windowTitle}>{settings.windowTitle} (not running)</option>
              )}
              {windows.map((w) => (
                <option key={w.title} value={w.title}>
                  {w.title} ({w.appName})
                </option>
              ))}
            </select>
            <button
              onClick={refreshWindows}
              className="shrink-0 rounded-lg bg-[#396cd8] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
            >
              Refresh
            </button>
          </div>
          <p className="mt-2 text-xs text-[#888]">
            Detection matches this automatically once the game is running - you only need to
            change it here if the wrong window gets picked up.
          </p>
        </div>

        <div>
          <p className="mb-2 flex items-center justify-between text-sm font-medium">
            <span>Scan region (% of window)</span>
            <ResetButton
              onClick={() => updateSettings({ region: DEFAULT_DETECTION_SETTINGS.region })}
              disabled={
                region.x === DEFAULT_DETECTION_SETTINGS.region.x &&
                region.y === DEFAULT_DETECTION_SETTINGS.region.y &&
                region.width === DEFAULT_DETECTION_SETTINGS.region.width &&
                region.height === DEFAULT_DETECTION_SETTINGS.region.height
              }
            />
          </p>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              X
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(region.x * 100)}
                onChange={(e) => updateSettings({ region: { x: Number(e.currentTarget.value) / 100 } })}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Y
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(region.y * 100)}
                onChange={(e) => updateSettings({ region: { y: Number(e.currentTarget.value) / 100 } })}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Width
              <input
                type="number"
                min={1}
                max={100}
                value={Math.round(region.width * 100)}
                onChange={(e) =>
                  updateSettings({ region: { width: Number(e.currentTarget.value) / 100 } })
                }
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Height
              <input
                type="number"
                min={1}
                max={100}
                value={Math.round(region.height * 100)}
                onChange={(e) =>
                  updateSettings({ region: { height: Number(e.currentTarget.value) / 100 } })
                }
                className={fieldClass}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-[#888]">
            Relative to the top-left of the selected window. Tune it with the preview below until
            it tightly frames the map name.
          </p>
        </div>

        <label className={sliderLabelClass}>
          <span className={sliderHeaderClass}>
            <span>Match threshold</span>
            <span className="flex items-center gap-2">
              {Math.round(settings.threshold * 100)}%
              <ResetButton
                onClick={() => updateSettings({ threshold: DEFAULT_DETECTION_SETTINGS.threshold })}
                disabled={settings.threshold === DEFAULT_DETECTION_SETTINGS.threshold}
              />
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.threshold * 100)}
            onChange={(e) => updateSettings({ threshold: Number(e.currentTarget.value) / 100 })}
          />
        </label>

        <label className={sliderLabelClass}>
          <span className={sliderHeaderClass}>
            <span>Brightness threshold</span>
            <span className="flex items-center gap-2">
              {settings.brightnessThreshold}
              <ResetButton
                onClick={() =>
                  updateSettings({ brightnessThreshold: DEFAULT_DETECTION_SETTINGS.brightnessThreshold })
                }
                disabled={settings.brightnessThreshold === DEFAULT_DETECTION_SETTINGS.brightnessThreshold}
              />
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={255}
            step={1}
            value={settings.brightnessThreshold}
            onChange={(e) => updateSettings({ brightnessThreshold: Number(e.currentTarget.value) })}
          />
          <p className="text-xs text-[#888]">
            Pixels brighter than this are kept as text, everything else is dropped to isolate the
            map name from the background. Lower it if scans miss text on a dim screen/HDR setup,
            raise it if the background is being picked up as text.
          </p>
        </label>
      </div>

      <div className="flex w-full flex-col gap-6 lg:max-w-[360px]">
        <div className="flex flex-col gap-2 rounded-xl bg-white p-4 text-left text-sm shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:bg-[#0f0f0f98]">
          <div>
            <span className="font-medium">Last OCR text: </span>
            {lastText || "—"}
          </div>
          <div>
            <span className="font-medium">Matched map: </span>
            {lastMatch ?? "No match"}
          </div>
          {error && <div className="text-[#c0392b]">{error}</div>}
        </div>

        {scanDuration !== null && (
          <p className="text-xs text-[#888]">Scan took {Math.round(scanDuration)} ms</p>
        )}

        {preview && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium">Scan region preview</span>
            <img
              src={preview}
              alt="Scan region preview"
              className="max-w-full rounded-lg border border-black/10 dark:border-white/10"
            />
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
