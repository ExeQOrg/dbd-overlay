import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

interface GalleryImage {
  name: string;
  path: string;
}

export default function Gallery() {
  const [search, setSearch] = useState("");
  const [images, setImages] = useState<GalleryImage[]>([]);

  const loadImages = () => {
    invoke<GalleryImage[]>("list_gallery_images").then(setImages);
  };

  useEffect(() => {
    loadImages();
  }, []);

  const filtered = images.filter((image) =>
    image.name.toLowerCase().includes(search.toLowerCase())
  );

  async function sendImage(image: GalleryImage) {
    await emit("update-content", { imageUrl: convertFileSrc(image.path) });
  }

  return (
    <main className="flex flex-col items-center px-8 pt-[10vh] text-center">
      <h1 className="mb-6 text-center">DBD Overlay Gallery</h1>

      <div className="mb-6 flex w-full max-w-[320px] gap-2">
        <input
          className="w-full rounded-lg border border-transparent bg-white px-5 py-2.5 text-base font-medium text-[#0f0f0f] shadow-[0_2px_2px_rgba(0,0,0,0.2)] outline-none transition-colors duration-200 focus:border-[#396cd8] dark:bg-[#0f0f0f98] dark:text-white"
          type="text"
          placeholder="Search images..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <button
          onClick={loadImages}
          className="shrink-0 rounded-lg bg-[#396cd8] px-4 py-2.5 text-base font-medium text-white shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
        >
          Refresh
        </button>
      </div>

      <div className="grid w-full max-w-[500px] grid-cols-3 gap-6">
        {filtered.map((image) => (
          <button
            key={image.path}
            onClick={() => sendImage(image)}
            className="flex flex-col items-center rounded-xl bg-white p-5 font-medium text-inherit shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)] dark:bg-[#0f0f0f98]"
          >
            <img
              src={convertFileSrc(image.path)}
              className="h-20 py-3"
              alt={image.name}
            />
            <span>{image.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full mt-4 text-[#888]">
            {images.length === 0
              ? "No images found. Add some to the app's data \"maps\" folder."
              : `No images match "${search}"`}
          </p>
        )}
      </div>
    </main>
  );
}
