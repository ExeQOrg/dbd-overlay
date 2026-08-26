import { useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { createWorker } from "tesseract.js";
import type { Worker } from "tesseract.js";
import {
  DetectionRegion,
  DetectionSettings,
  loadDetectionSettings,
  saveDetectionSettings,
} from "../lib/detectionSettings";
import { findBestMapMatch } from "../lib/mapMatching";

interface GalleryImage {
  name: string;
  path: string;
}

interface CapturableWindow {
  title: string;
  appName: string;
}

export default function MapDetection() {
  const [settings, setSettings] = useState<DetectionSettings>(() => loadDetectionSettings());
  const [scanning, setScanning] = useState(false);
  const [lastText, setLastText] = useState("");
  const [lastMatch, setLastMatch] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windows, setWindows] = useState<CapturableWindow[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const lastSentRef = useRef<string | null>(null);
  const scanNowRef = useRef(scanNow);

  useEffect(() => {
    scanNowRef.current = scanNow;
  });

  useEffect(() => {
    refreshWindows();

    const unlisten = listen("trigger-scan", () => {
      scanNowRef.current();
    });

    return () => {
      workerRef.current?.terminate();
      unlisten.then((fn) => fn());
    };
  }, []);

  function refreshWindows() {
    invoke<CapturableWindow[]>("list_capturable_windows").then(setWindows);
  }

  function updateSettings(patch: Partial<Omit<DetectionSettings, "region">> & { region?: Partial<DetectionRegion> }) {
    const next: DetectionSettings = {
      ...settings,
      ...patch,
      region: { ...settings.region, ...patch.region },
    };
    setSettings(next);
    saveDetectionSettings(next);
  }

  async function scanNow() {
    if (scanning) return;
    if (!settings.windowTitle) {
      setError("Pick a window to capture first.");
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const [images, dataUrl] = await Promise.all([
        invoke<GalleryImage[]>("list_gallery_images"),
        invoke<string>("capture_screen_region", {
          x: settings.region.x,
          y: settings.region.y,
          width: settings.region.width,
          height: settings.region.height,
          windowTitle: settings.windowTitle,
        }),
      ]);
      setPreview(dataUrl);

      if (!workerRef.current) {
        workerRef.current = await createWorker("eng");
        await workerRef.current.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ",
        });
      }

      const { data } = await workerRef.current.recognize(dataUrl);
      const text = data.text.trim();
      setLastText(text);

      const match = findBestMapMatch(text, images, settings.threshold);
      if (match) {
        setLastMatch(match.name);
        if (lastSentRef.current !== match.path) {
          lastSentRef.current = match.path;
          await emit("update-content", { imageUrl: convertFileSrc(match.path) });
        }
      } else {
        setLastMatch(null);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  }

  const region = settings.region;

  return (
    <main className="flex flex-col items-center px-8 pt-[10vh] text-center">
      <h1 className="mb-6 text-center">Map Detection</h1>

      <button
        onClick={scanNow}
        disabled={scanning}
        className="mb-2 rounded-lg bg-[#396cd8] px-5 py-2.5 text-base font-medium text-white shadow-[0_2px_2px_rgba(0,0,0,0.2)] disabled:opacity-60"
      >
        {scanning ? "Scanning…" : "Scan Now"}
      </button>
      <p className="mb-6 text-xs text-[#888]">Or press Ctrl+O anytime, even while the game is focused.</p>

      <div className="flex w-full max-w-[820px] flex-col gap-6 text-left lg:flex-row lg:items-start">
      <div className="flex w-full flex-col gap-6 lg:max-w-[360px]">
        <div>
          <p className="mb-2 text-sm font-medium">Capture window</p>
          <div className="flex gap-2">
            <select
              value={settings.windowTitle}
              onChange={(e) => updateSettings({ windowTitle: e.currentTarget.value })}
              className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-sm shadow-[0_2px_2px_rgba(0,0,0,0.2)] dark:bg-[#0f0f0f98] dark:text-white"
            >
              <option value="">Select a window…</option>
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
            Only windows that are currently open are listed - launch the game, then hit Refresh.
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Scan region (% of window)</p>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              X
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(region.x * 100)}
                onChange={(e) => updateSettings({ region: { x: Number(e.currentTarget.value) / 100 } })}
                className="rounded-lg border border-transparent bg-white px-3 py-2 text-sm shadow-[0_2px_2px_rgba(0,0,0,0.2)] dark:bg-[#0f0f0f98] dark:text-white"
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
                className="rounded-lg border border-transparent bg-white px-3 py-2 text-sm shadow-[0_2px_2px_rgba(0,0,0,0.2)] dark:bg-[#0f0f0f98] dark:text-white"
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
                className="rounded-lg border border-transparent bg-white px-3 py-2 text-sm shadow-[0_2px_2px_rgba(0,0,0,0.2)] dark:bg-[#0f0f0f98] dark:text-white"
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
                className="rounded-lg border border-transparent bg-white px-3 py-2 text-sm shadow-[0_2px_2px_rgba(0,0,0,0.2)] dark:bg-[#0f0f0f98] dark:text-white"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-[#888]">
            Relative to the top-left of the selected window. Tune it with the preview below until
            it tightly frames the map name.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="flex justify-between text-sm font-medium">
            <span>Match threshold</span>
            <span>{Math.round(settings.threshold * 100)}%</span>
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
