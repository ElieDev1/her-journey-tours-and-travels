import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import type { ImageDTO } from "@shared/types";
import type { ImageKind } from "@shared/constants";
import { api, errorMessage } from "@client/lib/api";
import { imageFormData, prepareImage } from "@client/lib/image";
import { Badge } from "@client/components/ui/Badge";
import { Button } from "@client/components/ui/Button";
import { useToast } from "@client/components/ui/Toast";

const GROUPS: Array<{ kind: ImageKind; title: string; hint: string; multiple: boolean }> = [
  { kind: "cover", title: "Cover image", hint: "Shown on tour cards and at the top of the tour page. Landscape, at least 1600px wide.", multiple: false },
  { kind: "gallery", title: "Gallery", hint: "Additional photos from the trip. Upload several at once.", multiple: true },
  { kind: "poster", title: "Promotional poster", hint: "Optional flyer or poster shown in the Media section.", multiple: false },
];

function ImageTile({ image, tourId, canWrite, first, last, onMove }: { image: ImageDTO; tourId: number; canWrite: boolean; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [alt, setAlt] = useState(image.altText);
  const replaceInput = useRef<HTMLInputElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "tour", tourId] });

  const saveAlt = useMutation({
    mutationFn: () => api.patch(`/api/admin/images/${image.id}`, { altText: alt }),
    onSuccess: () => toast("Alt text saved"),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/admin/images/${image.id}`),
    onSuccess: () => {
      refresh();
      toast("Image removed");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const replace = useMutation({
    mutationFn: async (file: File) => api.put(`/api/admin/images/${image.id}/file`, imageFormData(await prepareImage(file), {})),
    onSuccess: () => {
      refresh();
      toast("Image replaced");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-line">
      <div className="relative aspect-[4/3] bg-sand">
        <img src={image.smallUrl ?? image.url} alt={image.altText} className="h-full w-full object-cover" loading="lazy" />
        {image.isPlaceholder && <Badge tone="gold" className="absolute top-2 left-2">Placeholder</Badge>}
        {(replace.isPending || remove.isPending) && <div className="absolute inset-0 animate-pulse bg-white/60" />}
      </div>
      <div className="space-y-2 p-3">
        <input
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          onBlur={() => alt !== image.altText && canWrite && saveAlt.mutate()}
          disabled={!canWrite}
          maxLength={250}
          placeholder="Describe the image (alt text)"
          aria-label="Alt text"
          className="w-full rounded-lg border border-line px-2.5 py-1.5 text-xs focus:border-forest-500 focus:outline-none"
        />
        {canWrite && (
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <button onClick={() => onMove(-1)} disabled={first} className="rounded p-1 text-muted hover:bg-sand disabled:opacity-30" aria-label="Move earlier"><ArrowLeft className="size-3.5" /></button>
              <button onClick={() => onMove(1)} disabled={last} className="rounded p-1 text-muted hover:bg-sand disabled:opacity-30" aria-label="Move later"><ArrowRight className="size-3.5" /></button>
            </div>
            <div className="flex gap-1">
              <input ref={replaceInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => e.target.files?.[0] && replace.mutate(e.target.files[0])} />
              <button onClick={() => replaceInput.current?.click()} className="rounded p-1 text-forest-700 hover:bg-forest-50" title="Replace image" aria-label="Replace image"><RefreshCw className="size-3.5" /></button>
              <button onClick={() => confirm("Remove this image?") && remove.mutate()} className="rounded p-1 text-danger-600 hover:bg-danger-50" title="Remove image" aria-label="Remove image"><Trash2 className="size-3.5" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ImageManager({ tourId, images, canWrite, tourTitle }: { tourId: number; images: ImageDTO[]; canWrite: boolean; tourTitle: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputs = useRef<Partial<Record<ImageKind, HTMLInputElement | null>>>({});
  const [busy, setBusy] = useState<ImageKind | null>(null);

  const upload = async (kind: ImageKind, files: FileList) => {
    setBusy(kind);
    try {
      for (const file of Array.from(files)) {
        const prepared = await prepareImage(file);
        await api.post(`/api/admin/tours/${tourId}/images`, imageFormData(prepared, { kind, altText: `${tourTitle} – ${kind === "poster" ? "poster" : "photo"}` }));
      }
      toast(files.length > 1 ? `${files.length} images uploaded` : "Image uploaded");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "tour", tourId] });
    }
  };

  const move = useMutation({
    mutationFn: async ({ list, index, dir }: { list: ImageDTO[]; index: number; dir: -1 | 1 }) => {
      const a = list[index]!;
      const b = list[index + dir]!;
      await Promise.all([
        api.patch(`/api/admin/images/${a.id}`, { sortOrder: b.sortOrder === a.sortOrder ? b.sortOrder + dir : b.sortOrder }),
        api.patch(`/api/admin/images/${b.id}`, { sortOrder: a.sortOrder }),
      ]);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "tour", tourId] }),
  });

  return (
    <div className="space-y-8">
      {GROUPS.map((g) => {
        const list = images.filter((i) => i.kind === g.kind).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <div key={g.kind}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-sans text-sm font-semibold text-forest-950">{g.title}</h3>
                <p className="text-xs text-muted">{g.hint}</p>
              </div>
              {canWrite && (
                <>
                  <input
                    ref={(el) => {
                      inputs.current[g.kind] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    multiple={g.multiple}
                    hidden
                    onChange={(e) => {
                      if (e.target.files?.length) void upload(g.kind, e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" variant="secondary" loading={busy === g.kind} icon={<ImagePlus className="size-4" />} onClick={() => inputs.current[g.kind]?.click()}>
                    {g.multiple ? "Upload images" : list.length ? "Replace" : "Upload"}
                  </Button>
                </>
              )}
            </div>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">No {g.title.toLowerCase()} yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((img, i) => (
                  <ImageTile key={`${img.id}-${img.url}`} image={img} tourId={tourId} canWrite={canWrite} first={i === 0} last={i === list.length - 1} onMove={(dir) => move.mutate({ list, index: i, dir })} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted">Images are resized in your browser (max 1920px, plus an 800px version for fast loading) and stored in Cloudflare R2. JPEG, PNG, WebP or AVIF up to 8 MB.</p>
    </div>
  );
}
