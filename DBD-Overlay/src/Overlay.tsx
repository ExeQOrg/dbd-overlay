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
    <div style={{ width: '100vw', height: '100vh', pointerEvents: 'none' }}>
      {content.text && <p style={{ color: 'white', fontSize: '2rem' }}>{content.text}</p>}
      {content.imageUrl && (
        <img src={content.imageUrl} alt="" style={{ width: "200px", height: "auto" }} />
      )}
    </div>
  );
}
