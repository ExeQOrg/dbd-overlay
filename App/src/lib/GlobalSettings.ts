//Test
export interface GlobalSettings {
  preferredCreator: string;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  preferredCreator: "",
};

const STORAGE_KEY = "global-settings";

export function loadGlobalSettings(): GlobalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GLOBAL_SETTINGS;
    return { ...DEFAULT_GLOBAL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_GLOBAL_SETTINGS;
  }
}

export function saveGlobalSettings(settings: GlobalSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
