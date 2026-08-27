import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { createWorker } from "tesseract.js";
import type { Worker } from "tesseract.js";
import {
  DetectionRegion,
  DetectionSettings,
  loadDetectionSettings,
  saveDetectionSettings,
} from "./DetectionSettings";
import { findBestMapMatch } from "./MapMatching";
import { GalleryImage } from "./Gallery";

interface CapturableWindow {
  title: string;
  appName: string;
}

interface DetectionContextValue {
  settings: DetectionSettings;
  scanning: boolean;
  lastText: string;
  lastMatch: string | null;
  scanDuration: number | null;
  preview: string | null;
  error: string | null;
  windows: CapturableWindow[];
  images: GalleryImage[];
  scanNow: () => Promise<void>;
  refreshWindows: () => void;
  refreshGalleryImages: () => void;
  updateSettings: (patch: Partial<Omit<DetectionSettings, "region">> & { region?: Partial<DetectionRegion> }) => void;
}

const DetectionContext = createContext<DetectionContextValue | null>(null);

export function DetectionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DetectionSettings>(() => loadDetectionSettings());
  const [scanning, setScanning] = useState(false);
  const [lastText, setLastText] = useState("");
  const [lastMatch, setLastMatch] = useState<string | null>(null);
  const [scanDuration, setScanDuration] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
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

  function updateSettings(patch: Partial<Omit<DetectionSettings, "region">> & { region?: Partial<DetectionRegion> }) {
    const next: DetectionSettings = {
      ...settingsRef.current,
      ...patch,
      region: { ...settingsRef.current.region, ...patch.region },
    };
    setSettings(next);
    saveDetectionSettings(next);
  }

  async function scanNow() {
    if (scanningRef.current) return;
    const currentSettings = settingsRef.current;
    if (!currentSettings.windowTitle) {
      setError("Pick a window to capture first.");
      return;
    }
    setScanning(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const [freshImages, dataUrl] = await Promise.all([
        invoke<GalleryImage[]>("list_gallery_images"),
        invoke<string>("capture_screen_region", {
          x: currentSettings.region.x,
          y: currentSettings.region.y,
          width: currentSettings.region.width,
          height: currentSettings.region.height,
          windowTitle: currentSettings.windowTitle,
          brightnessThreshold: currentSettings.brightnessThreshold,
        }),
      ]);
      setImages(freshImages);
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

      // Try the preferred creator's maps first so a shared map name doesn't
      // get matched to someone else's version; fall back to the full set if
      // that creator doesn't have a map for it.
      const preferredImages = currentSettings.preferredCreator
        ? freshImages.filter((image) => image.creator === currentSettings.preferredCreator)
        : freshImages;
      const match =
        findBestMapMatch(text, preferredImages, currentSettings.threshold) ??
        (currentSettings.preferredCreator ? findBestMapMatch(text, freshImages, currentSettings.threshold) : null);
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
      setScanDuration(performance.now() - startedAt);
      setScanning(false);
    }
  }

  const value: DetectionContextValue = {
    settings,
    scanning,
    lastText,
    lastMatch,
    scanDuration,
    preview,
    error,
    windows,
    images,
    scanNow,
    refreshWindows,
    refreshGalleryImages,
    updateSettings,
  };

  return <DetectionContext.Provider value={value}>{children}</DetectionContext.Provider>;
}

export function useDetection() {
  const ctx = useContext(DetectionContext);
  if (!ctx) throw new Error("useDetection must be used within a DetectionProvider");
  return ctx;
}
