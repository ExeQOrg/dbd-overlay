export interface DetectionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionSettings {
  region: DetectionRegion;
  threshold: number;
  windowTitle: string;
  preferredCreator: string;
}

export const DEFAULT_DETECTION_SETTINGS: DetectionSettings = {
  region: { x: 0.35, y: 0.05, width: 0.3, height: 0.08 },
  threshold: 0.55,
  windowTitle: "",
  preferredCreator: "",
};

const STORAGE_KEY = "map-detection-settings";

export function loadDetectionSettings(): DetectionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DETECTION_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_DETECTION_SETTINGS,
      ...parsed,
      region: { ...DEFAULT_DETECTION_SETTINGS.region, ...parsed.region },
    };
  } catch {
    return DEFAULT_DETECTION_SETTINGS;
  }
}

export function saveDetectionSettings(settings: DetectionSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
