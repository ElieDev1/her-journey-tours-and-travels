import type { ImageDTO } from "@shared/types";
import { cn } from "@client/lib/cn";

interface Props {
  image: ImageDTO | null | undefined;
  /** CSS `sizes` hint for responsive selection. */
  sizes?: string;
  className?: string;
  eager?: boolean;
  fallbackAlt?: string;
}

/** Responsive tour image: uses the small rendition where it is enough. */
export function TourImage({ image, sizes = "(min-width: 1024px) 33vw, 100vw", className, eager, fallbackAlt = "" }: Props) {
  const src = image?.url || "/images/placeholders/farm-hills.svg";
  const srcSet = image?.smallUrl ? `${image.smallUrl} 800w, ${image.url} 1920w` : undefined;
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={image?.altText || fallbackAlt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      width={image?.width ?? 1600}
      height={image?.height ?? 1000}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
