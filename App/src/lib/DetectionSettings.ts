export interface DetectionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionSettings {
  regions: DetectionRegion[];
  threshold: number;
  windowTitle: string;
  brightnessThreshold: number;
  scanShortcut: string;
  autoDetectEnabled: boolean;
  autoDetectInterval: number;
}

export const DEFAULT_REGION: DetectionRegion = { x: 0.3, y: 0.75, width: 0.4, height: 0.15 };

export const DEFAULT_DETECTION_SETTINGS: DetectionSettings = {
  regions: [DEFAULT_REGION],
  threshold: 0.55,
  windowTitle: "DeadByDaylight",
  brightnessThreshold: 120,
  scanShortcut: "CommandOrControl+O",
  autoDetectEnabled: false,
  autoDetectInterval: 2,
};

const STORAGE_KEY = "map-detection-settings";

export function loadDetectionSettings(): DetectionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DETECTION_SETTINGS;
    const parsed = JSON.parse(raw);

    // Older versions stored a single `region` object instead of `regions`.
    let regions: DetectionRegion[];
    if (Array.isArray(parsed.regions) && parsed.regions.length > 0) {
      regions = parsed.regions.map((r: Partial<DetectionRegion>) => ({ ...DEFAULT_REGION, ...r }));
    } else if (parsed.region) {
      regions = [{ ...DEFAULT_REGION, ...parsed.region }];
    } else {
      regions = DEFAULT_DETECTION_SETTINGS.regions;
    }

    return {
      ...DEFAULT_DETECTION_SETTINGS,
      ...parsed,
      regions,
    };
  } catch {
    return DEFAULT_DETECTION_SETTINGS;
  }
}

export function saveDetectionSettings(settings: DetectionSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
