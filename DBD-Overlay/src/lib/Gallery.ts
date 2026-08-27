export interface GalleryImage {
  name: string;
  creator: string;
  family: string;
  path: string;
}

export function getCreators(images: GalleryImage[]): string[] {
  return Array.from(new Set(images.map((image) => image.creator))).filter(Boolean).sort();
}
