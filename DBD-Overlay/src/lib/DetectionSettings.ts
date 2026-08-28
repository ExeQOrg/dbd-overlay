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
  brightnessThreshold: number;
}

export const DEFAULT_DETECTION_SETTINGS: DetectionSettings = {
  region: { x: 0.3, y: 0.75, width: 0.4, height: 0.15 },
  threshold: 0.55,
  windowTitle: "DeadByDaylight",
  brightnessThreshold: 120,
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
