import { useState } from "react";
import { useDetection } from "../lib/DetectionContext";
import { getCreators } from "../lib/Gallery";
import {
  DEFAULT_GLOBAL_SETTINGS,
  GlobalSettings,
  loadGlobalSettings,
  saveGlobalSettings,
} from "../lib/GlobalSettings";
import { pageClass, fieldClass } from "../lib/Styles";
import ResetButton from "../components/ResetButton";

export default function GlobalSettingsPage() {
  const { images } = useDetection();
  const [settings, setSettings] = useState<GlobalSettings>(() => loadGlobalSettings());

  const creators = getCreators(images);

  function updateSettings(patch: Partial<GlobalSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveGlobalSettings(next);
  }

  return (
    <main className={pageClass}>
      <h1 className="mb-6 text-center">Settings</h1>

      <div className="flex w-full max-w-[320px] flex-col gap-6 text-left">
        <div>
          <p className="mb-2 flex items-center justify-between text-sm font-medium">
            <span>Preferred creator</span>
            <ResetButton
              onClick={() => updateSettings({ preferredCreator: DEFAULT_GLOBAL_SETTINGS.preferredCreator })}
              disabled={settings.preferredCreator === DEFAULT_GLOBAL_SETTINGS.preferredCreator}
            />
          </p>
          <select
            value={settings.preferredCreator}
            onChange={(e) => updateSettings({ preferredCreator: e.currentTarget.value })}
            className={`w-full ${fieldClass}`}
          >
            <option value="">Any creator</option>
            {creators.map((creator) => (
              <option key={creator} value={creator}>
                {creator}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-[#888]">
            Used as the default creator filter on the Gallery page, and to prefer this creator's
            version of a map when detection finds it shared by multiple creators.
          </p>
        </div>
      </div>
    </main>
  );
}
