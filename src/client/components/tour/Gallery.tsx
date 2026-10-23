import { useState } from "react";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import type { ImageDTO } from "@shared/types";
import { TourImage } from "@client/components/site/TourImage";
import { Modal } from "@client/components/ui/Modal";

export function Gallery({ images, title }: { images: ImageDTO[]; title: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const photos = [...images.filter((i) => i.kind === "cover"), ...images.filter((i) => i.kind === "gallery")];
  if (!photos.length) return null;
  const [main, ...rest] = photos;
  const thumbs = rest.slice(0, 4);
  const current = index === null ? null : photos[index];

  return (
    <>
      <div className={`grid gap-3 ${thumbs.length ? "lg:grid-cols-[2fr_1fr]" : ""}`}>
        <button onClick={() => setIndex(0)} className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-sand" aria-label="Open photo gallery">
          <TourImage image={main} eager fallbackAlt={title} sizes="(min-width: 1024px) 66vw, 100vw" />
        </button>
        {thumbs.length > 0 && (
          <div className={`grid gap-3 lg:grid-cols-1 ${thumbs.length > 1 ? "grid-cols-2 lg:grid-rows-2" : "grid-cols-1 lg:grid-rows-1"}`}>
            {thumbs.slice(0, 2).map((img, i) => (
              <button key={img.id} onClick={() => setIndex(i + 1)} className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-sand lg:aspect-auto lg:h-full">
                <TourImage image={img} fallbackAlt={title} sizes="(min-width: 1024px) 33vw, 50vw" />
                {i === 1 && photos.length > 3 && (
                  <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-forest-800 shadow-card">
                    <Images className="size-3.5" /> {photos.length} photos
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal open={current !== null} onClose={() => setIndex(null)} title={title} size="xl">
        {current && index !== null && (
          <div>
            <div className="relative overflow-hidden rounded-2xl bg-forest-950">
              <img src={current.url} alt={current.altText || title} className="mx-auto max-h-[65vh] w-auto object-contain" />
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => setIndex((index - 1 + photos.length) % photos.length)}
                    className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/90 p-2 text-forest-900 shadow"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    onClick={() => setIndex((index + 1) % photos.length)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/90 p-2 text-forest-900 shadow"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>
            <p className="mt-3 text-center text-sm text-muted">
              {current.altText} · {index + 1} / {photos.length}
              {current.isPlaceholder && " · Illustration"}
            </p>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <button key={p.id} onClick={() => setIndex(i)} className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl ring-2 ${i === index ? "ring-sun-400" : "ring-transparent"}`}>
                  <TourImage image={p} sizes="96px" />
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
