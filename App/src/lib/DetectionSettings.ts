export interface DetectionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  // Master switch - a disabled region is skipped by every scan, regardless
  // of the two flags below.
  enabled: boolean;
  // Whether this region is captured when a scan is triggered manually (the
  // scan shortcut or the "Scan Now" button), independently of auto-detect.
  scanOnShortcut: boolean;
  // Whether this region is captured by the auto-detect loop, independently
  // of manual scans.
  scanOnAutoDetect: boolean;
  // Whether the crop is reduced to grayscale then thresholded to pure
  // black/white before OCR (see capture_screen_region in lib.rs) or left as
  // the raw color crop.
  grayscale: boolean;
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

// Generic single-region template - used as the new-region default (addRegion)
// and to backfill fields on regions loaded from storage that predate them.
export const DEFAULT_REGION: DetectionRegion = {
  x: 0.3,
  y: 0.75,
  width: 0.4,
  height: 0.15,
  enabled: true,
  scanOnShortcut: true,
  scanOnAutoDetect: true,
  grayscale: true,
};

export const DEFAULT_REGIONS: DetectionRegion[] = [
  {
    x: 0.3,
    y: 0.75,
    width: 0.4,
    height: 0.15,
    enabled: true,
    scanOnShortcut: true,
    scanOnAutoDetect: false,
    grayscale: true,
  },
  {
    x: 0.0,
    y: 0.75,
    width: 0.55,
    height: 0.15,
    enabled: true,
    scanOnShortcut: false,
    scanOnAutoDetect: true,
    grayscale: false,
  },
];

export const DEFAULT_DETECTION_SETTINGS: DetectionSettings = {
  regions: DEFAULT_REGIONS,
  threshold: 0.55,
  windowTitle: "DeadByDaylight",
  brightnessThreshold: 120,
  scanShortcut: "CommandOrControl+O",
  autoDetectEnabled: false,
  autoDetectInterval: 1,
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
