import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

interface OverlayContent {
  text?: string;
  imageUrl?: string;
}

export default function Overlay() {
  const [content, setContent] = useState<OverlayContent>({});

  useEffect(() => {
    const unlisten = listen<OverlayContent>('update-content', (event) => {
      setContent(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return (
    <div className="pointer-events-none h-screen w-screen">
      {content.text && <p className="text-2xl text-white">{content.text}</p>}
      {content.imageUrl && (
        <img src={content.imageUrl} alt="" className="h-auto w-[200px]" />
      )}
    </div>
  );
}
