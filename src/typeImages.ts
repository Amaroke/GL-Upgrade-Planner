const images = import.meta.glob<string>("./assets/types/*.webp", {
  eager: true,
  import: "default",
});

const IMAGES_BY_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(images).map(([path, url]) => [
    path.slice(path.lastIndexOf("/") + 1, -".webp".length),
    url,
  ]),
);

export const TYPES_WITHOUT_IMAGE: string[] = [];

export function typeImage(typeId: string): string | null {
  return IMAGES_BY_TYPE[typeId] ?? null;
}
