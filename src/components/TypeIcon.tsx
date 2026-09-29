import { typeImage } from "../typeImages";

export function TypeIcon({ typeId, size }: { typeId: string; size: number }) {
  const src = typeImage(typeId);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 object-contain drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]"
    />
  );
}
