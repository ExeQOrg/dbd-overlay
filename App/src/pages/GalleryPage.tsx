import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { GalleryImage, getCreators } from "../lib/Gallery";
import { loadGlobalSettings } from "../lib/GlobalSettings";
import {
  pageClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  outlineButtonClass,
  panelClass,
} from "../lib/Styles";
import PageHeading from "../components/PageHeading";

export default function GalleryPage() {
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState(() => loadGlobalSettings().preferredCreator);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [overlayVisible, setOverlayVisible] = useState(true);

  const loadImages = () => {
    invoke<GalleryImage[]>("list_gallery_images").then(setImages);
  };

  useEffect(() => {
    loadImages();
    const unlisten = listen("maps-updated", loadImages);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const overlay = WebviewWindow.getByLabel("overlay");
    overlay?.then((win) => win?.isVisible().then(setOverlayVisible));
  }, []);

  async function toggleOverlayVisible() {
    const overlay = await WebviewWindow.getByLabel("overlay");
    if (!overlay) return;
    if (overlayVisible) {
      await overlay.hide();
    } else {
      await overlay.show();
    }
    setOverlayVisible(!overlayVisible);
  }

  async function clearOverlay() {
    await emit("update-content", {});
  }

  async function openPopout() {
    await invoke("open_obs_popout");
  }

  const creators = getCreators(images);

  const filtered = images.filter((image) => {
    const term = search.toLowerCase();
    // Searching the family name (e.g. "Coldwind Farm") surfaces every map in
    // that realm, even though each tile's displayed name is just its own
    // filename ("Rotten Fields").
    const matchesSearch =
      image.name.toLowerCase().includes(term) || image.family.toLowerCase().includes(term);
    const matchesCreator = !creatorFilter || image.creator === creatorFilter;
    return matchesSearch && matchesCreator;
  });

  async function sendImage(image: GalleryImage) {
    await emit("update-content", { imageUrl: convertFileSrc(image.path) });
  }

  return (
    <main className={pageClass}>
      <PageHeading>DBD Toolbox Gallery</PageHeading>

      <div className="mb-6 flex w-full max-w-[480px] gap-2">
        <input
          className={`w-full ${fieldClass}`}
          type="text"
          placeholder="Search images..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <select
          value={creatorFilter}
          onChange={(e) => setCreatorFilter(e.currentTarget.value)}
          className={`shrink-0 ${fieldClass}`}
        >
          <option value="">All creators</option>
          {creators.map((creator) => (
            <option key={creator} value={creator}>
              {creator}
            </option>
          ))}
        </select>
        <button onClick={loadImages} className={`shrink-0 ${secondaryButtonClass}`}>
          Refresh
        </button>
      </div>

      <div className="mb-6 flex w-full max-w-[480px] gap-2">
        <button onClick={toggleOverlayVisible} className={`flex-1 ${primaryButtonClass}`}>
          {overlayVisible ? "Hide Overlay" : "Show Overlay"}
        </button>
        <button onClick={clearOverlay} className={`flex-1 ${secondaryButtonClass}`}>
          Clear Overlay
        </button>
        <button onClick={openPopout} className={`flex-1 ${outlineButtonClass}`}>
          Popout OBS
        </button>
      </div>

      <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6">
        {filtered.map((image) => (
          <button
            key={image.path}
            onClick={() => sendImage(image)}
            className={`flex flex-col items-center p-5 font-medium text-ink transition-all duration-200 hover:-translate-y-1 hover:border-blood/50 ${panelClass}`}
          >
            <img
              src={convertFileSrc(image.path)}
              className="h-44 py-3"
              alt={image.name}
            />
            <span>{image.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full mt-4 text-ink/65">
            {images.length === 0
              ? "No images found. Add some to the app's data \"Maps\" folder."
              : `No images match "${search}"`}
          </p>
        )}
      </div>
    </main>
  );
}
