export type Anchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface OverlaySettings {
  size: number;
  opacity: number;
  anchor: Anchor;
}

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  size: 250,
  opacity: 0.5,
  anchor: "top-left",
};

const STORAGE_KEY = "overlay-settings";

export function loadOverlaySettings(): OverlaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OVERLAY_SETTINGS;
    return { ...DEFAULT_OVERLAY_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_OVERLAY_SETTINGS;
  }
}

export function saveOverlaySettings(settings: OverlaySettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
