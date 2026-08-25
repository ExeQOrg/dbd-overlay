import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { loadOverlaySettings, OverlaySettings } from './lib/overlaySettings';

interface OverlayContent {
  text?: string;
  imageUrl?: string;
}

const anchorClasses: Record<OverlaySettings["anchor"], string> = {
  "top-left": "top-0 left-0",
  "top-right": "top-0 right-0",
  "bottom-left": "bottom-0 left-0",
  "bottom-right": "bottom-0 right-0",
};

export default function Overlay() {
  const [content, setContent] = useState<OverlayContent>({});
  const [settings, setSettings] = useState<OverlaySettings>(() => loadOverlaySettings());

  useEffect(() => {
    const unlistenContent = listen<OverlayContent>('update-content', (event) => {
      setContent(event.payload);
    });
    const unlistenSettings = listen<OverlaySettings>('update-overlay-settings', (event) => {
      setSettings(event.payload);
    });
    return () => {
      unlistenContent.then(fn => fn());
      unlistenSettings.then(fn => fn());
    };
  }, []);

  return (
    <div className="pointer-events-none relative h-screen w-screen overflow-hidden">
      {content.text && (
        <p className={`absolute text-2xl text-white ${anchorClasses[settings.anchor]}`}>
          {content.text}
        </p>
      )}
      {content.imageUrl && (
        <img
          src={content.imageUrl}
          alt=""
          className={`absolute h-auto ${anchorClasses[settings.anchor]}`}
          style={{ width: settings.size, opacity: settings.opacity }}
        />
      )}
    </div>
  );
}
