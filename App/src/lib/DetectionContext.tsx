import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { createWorker } from "tesseract.js";
import type { Worker } from "tesseract.js";
import {
  DEFAULT_REGION,
  DetectionRegion,
  DetectionSettings,
  loadDetectionSettings,
  saveDetectionSettings,
} from "./DetectionSettings";
import { loadGlobalSettings } from "./GlobalSettings";
import { findBestMapMatch } from "./MapMatching";
import { GalleryImage } from "./Gallery";

interface CapturableWindow {
  title: string;
  appName: string;
}

interface DetectionContextValue {
  settings: DetectionSettings;
  scanning: boolean;
  lastTexts: string[];
  lastMatch: string | null;
  scanDuration: number | null;
  previews: string[];
  error: string | null;
  windows: CapturableWindow[];
  images: GalleryImage[];
  scanNow: () => Promise<void>;
  refreshWindows: () => void;
  refreshGalleryImages: () => void;
  updateSettings: (patch: Partial<DetectionSettings>) => void;
  addRegion: () => void;
  updateRegion: (index: number, patch: Partial<DetectionRegion>) => void;
  removeRegion: (index: number) => void;
  setScanShortcut: (accelerator: string) => Promise<void>;
}

const DetectionContext = createContext<DetectionContextValue | null>(null);

export function DetectionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DetectionSettings>(() => loadDetectionSettings());
  const [scanning, setScanning] = useState(false);
  const [lastTexts, setLastTexts] = useState<string[]>([]);
  const [lastMatch, setLastMatch] = useState<string | null>(null);
  const [scanDuration, setScanDuration] = useState<number | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [windows, setWindows] = useState<CapturableWindow[]>([]);
  const [images, setImages] = useState<GalleryImage[]>([]);

  const settingsRef = useRef(settings);
  const scanningRef = useRef(scanning);
  const workerRef = useRef<Worker | null>(null);
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    scanningRef.current = scanning;
  }, [scanning]);

  useEffect(() => {
    refreshWindows();
    refreshGalleryImages();

    // The shortcut is only known to the frontend (persisted in localStorage),
    // so it has to be (re)registered with the backend on every launch - Rust
    // only knows the hardcoded fallback it registered before this ever runs.
    invoke("set_scan_shortcut", { shortcut: settingsRef.current.scanShortcut }).catch((err) => {
      console.error("failed to register scan shortcut", err);
    });

    const unlistenScan = listen("trigger-scan", () => {
      scanNow();
    });
    const unlistenMaps = listen("maps-updated", () => {
      refreshGalleryImages();
    });

    return () => {
      workerRef.current?.terminate();
      unlistenScan.then((fn) => fn());
      unlistenMaps.then((fn) => fn());
    };
  }, []);

  function refreshWindows() {
    invoke<CapturableWindow[]>("list_capturable_windows").then(setWindows);
  }

  function refreshGalleryImages() {
    invoke<GalleryImage[]>("list_gallery_images").then(setImages);
  }

  function updateSettings(patch: Partial<DetectionSettings>) {
    const next: DetectionSettings = { ...settingsRef.current, ...patch };
    setSettings(next);
    saveDetectionSettings(next);
  }

  function addRegion() {
    updateSettings({ regions: [...settingsRef.current.regions, { ...DEFAULT_REGION }] });
  }

  function updateRegion(index: number, patch: Partial<DetectionRegion>) {
    const regions = settingsRef.current.regions.map((r, i) => (i === index ? { ...r, ...patch } : r));
    updateSettings({ regions });
  }

  function removeRegion(index: number) {
    const regions = settingsRef.current.regions.filter((_, i) => i !== index);
    updateSettings({ regions: regions.length > 0 ? regions : [{ ...DEFAULT_REGION }] });
  }

  async function setScanShortcut(accelerator: string) {
    await invoke("set_scan_shortcut", { shortcut: accelerator });
    updateSettings({ scanShortcut: accelerator });
  }

  async function scanNow() {
    if (scanningRef.current) return;
    const currentSettings = settingsRef.current;
    if (!currentSettings.windowTitle) {
      setError("Pick a window to capture first.");
      return;
    }
    if (currentSettings.regions.length === 0) {
      setError("Add at least one scan region first.");
      return;
    }
    setScanning(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const [freshImages, dataUrls] = await Promise.all([
        invoke<GalleryImage[]>("list_gallery_images"),
        invoke<string[]>("capture_screen_region", {
          regions: currentSettings.regions.map(({ x, y, width, height }) => ({ x, y, width, height })),
          windowTitle: currentSettings.windowTitle,
          brightnessThreshold: currentSettings.brightnessThreshold,
        }),
      ]);
      setImages(freshImages);
      setPreviews(dataUrls);

      if (!workerRef.current) {
        workerRef.current = await createWorker("eng");
        await workerRef.current.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ",
        });
      }

      // OCR runs sequentially through the one shared worker, one region at a
      // time, rather than spinning up a worker per region.
      const texts: string[] = [];
      for (const dataUrl of dataUrls) {
        const { data } = await workerRef.current.recognize(dataUrl);
        texts.push(data.text.trim());
      }
      setLastTexts(texts);

      // Try the preferred creator's maps first so a shared map name doesn't
      // get matched to someone else's version; fall back to the full set if
      // that creator doesn't have a map for it.
      const preferredCreator = loadGlobalSettings().preferredCreator;
      const preferredImages = preferredCreator
        ? freshImages.filter((image) => image.creator === preferredCreator)
        : freshImages;

      // Each region is matched independently and the best-scoring hit across
      // all of them wins, so it doesn't matter which region actually framed
      // the map name.
      let bestMatch: (GalleryImage & { score: number }) | null = null;
      for (const text of texts) {
        const match =
          findBestMapMatch(text, preferredImages, currentSettings.threshold) ??
          (preferredCreator ? findBestMapMatch(text, freshImages, currentSettings.threshold) : null);
        if (match && (!bestMatch || match.score > bestMatch.score)) {
          bestMatch = match;
        }
      }

      if (bestMatch) {
        setLastMatch(bestMatch.name);
        if (lastSentRef.current !== bestMatch.path) {
          lastSentRef.current = bestMatch.path;
          await emit("update-content", { imageUrl: convertFileSrc(bestMatch.path) });
        }
      } else {
        setLastMatch(null);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setScanDuration(performance.now() - startedAt);
      setScanning(false);
    }
  }

  const value: DetectionContextValue = {
    settings,
    scanning,
    lastTexts,
    lastMatch,
    scanDuration,
    previews,
    error,
    windows,
    images,
    scanNow,
    refreshWindows,
    refreshGalleryImages,
    updateSettings,
    addRegion,
    updateRegion,
    removeRegion,
    setScanShortcut,
  };

  return <DetectionContext.Provider value={value}>{children}</DetectionContext.Provider>;
}

export function useDetection() {
  const ctx = useContext(DetectionContext);
  if (!ctx) throw new Error("useDetection must be used within a DetectionProvider");
  return ctx;
}
