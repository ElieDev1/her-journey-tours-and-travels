import { useEffect, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import type { ImageKind } from "@shared/constants";
import { Button } from "@client/components/ui/Button";

export interface PendingImageSet {
  cover: File | null;
  gallery: File[];
  poster: File | null;
}

export const emptyPendingImages = (): PendingImageSet => ({ cover: null, gallery: [], poster: null });

export function pendingCount(p: PendingImageSet): number {
  return (p.cover ? 1 : 0) + p.gallery.length + (p.poster ? 1 : 0);
}

/** Flatten into upload order: cover first, then gallery, then poster. */
export function pendingUploads(p: PendingImageSet): Array<{ kind: ImageKind; file: File }> {
  return [
    ...(p.cover ? [{ kind: "cover" as const, file: p.cover }] : []),
    ...p.gallery.map((file) => ({ kind: "gallery" as const, file })),
    ...(p.poster ? [{ kind: "poster" as const, file: p.poster }] : []),
  ];
}

function Preview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const img = useRef<HTMLImageElement>(null);
  // Create and revoke the preview URL in the same effect so it survives re-mounts.
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    if (img.current) img.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return (
    <div className="relative overflow-hidden rounded-xl bg-sand ring-1 ring-line">
      <img ref={img} alt={file.name} className="aspect-[4/3] w-full object-cover" />
      <button type="button" onClick={onRemove} className="absolute top-2 right-2 rounded-full bg-white/95 p-1 text-danger-600 shadow" aria-label={`Remove ${file.name}`}>
        <X className="size-4" />
      </button>
      <p className="truncate px-2 py-1.5 text-xs text-muted">{file.name}</p>
    </div>
  );
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/**
 * Image picker for a tour that has not been saved yet. Files are kept in the
 * browser and uploaded right after the tour is created.
 */
export function PendingImages({ value, onChange }: { value: PendingImageSet; onChange: (v: PendingImageSet) => void }) {
  const cover = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const poster = useRef<HTMLInputElement>(null);
  const pick = (files: FileList | null) => Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));

  const group = (title: string, hint: string, button: string, input: React.RefObject<HTMLInputElement | null>, files: File[], multiple: boolean, onPick: (files: File[]) => void, onRemove: (i: number) => void) => (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-sans text-sm font-semibold text-forest-950">{title}</h3>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple={multiple}
          hidden
          onChange={(e) => {
            onPick(pick(e.target.files));
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()}>
          {button}
        </Button>
      </div>
      {files.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">No image selected.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {files.map((f, i) => <Preview key={`${f.name}-${f.lastModified}-${i}`} file={f} onRemove={() => onRemove(i)} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <p className="rounded-xl bg-sun-50 px-4 py-3 text-sm text-sun-700 ring-1 ring-sun-300">
        Choose images now. They are uploaded automatically when you click <strong>Create tour</strong>.
      </p>
      {group("Cover image", "Shown on tour cards and at the top of the tour page.", value.cover ? "Change cover" : "Choose cover", cover, value.cover ? [value.cover] : [], false,
        (files) => files[0] && onChange({ ...value, cover: files[0] }),
        () => onChange({ ...value, cover: null }))}
      {group("Gallery", "More photos from the trip. You can choose several at once.", "Add photos", gallery, value.gallery, true,
        (files) => onChange({ ...value, gallery: [...value.gallery, ...files] }),
        (i) => onChange({ ...value, gallery: value.gallery.filter((_, j) => j !== i) }))}
      {group("Promotional poster", "Optional flyer or poster.", value.poster ? "Change poster" : "Choose poster", poster, value.poster ? [value.poster] : [], false,
        (files) => files[0] && onChange({ ...value, poster: files[0] }),
        () => onChange({ ...value, poster: null }))}
    </div>
  );
}
