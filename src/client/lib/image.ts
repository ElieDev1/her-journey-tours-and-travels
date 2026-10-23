export interface PreparedImage {
  file: Blob;
  small: Blob;
  width: number;
  height: number;
}

async function encode(bitmap: ImageBitmap, maxSide: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // Prefer WebP; fall back to JPEG where the browser cannot encode WebP.
  let blob = await toBlob("image/webp", 0.84);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.86);
  if (!blob) throw new Error("Could not process this image");
  return { blob, width, height };
}

/**
 * Resize an image in the browser before upload: a large version for galleries
 * (max 1920px) and a small one for cards and srcset (max 800px).
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  const bitmap = await createImageBitmap(file);
  try {
    const large = await encode(bitmap, 1920);
    const small = await encode(bitmap, 800);
    return { file: large.blob, small: small.blob, width: large.width, height: large.height };
  } finally {
    bitmap.close();
  }
}

export function imageFormData(prepared: PreparedImage, fields: Record<string, string>): FormData {
  const form = new FormData();
  const ext = prepared.file.type === "image/webp" ? "webp" : "jpg";
  form.set("file", prepared.file, `image.${ext}`);
  form.set("fileSmall", prepared.small, `image-small.${ext}`);
  form.set("width", String(prepared.width));
  form.set("height", String(prepared.height));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}
