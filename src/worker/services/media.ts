import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "../../shared/constants";
import { HttpError } from "../lib/http";
import { randomToken } from "../lib/crypto";

export function mediaUrl(key: string): string {
  return `/media/${key}`;
}

type ImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Identify an image by its magic bytes rather than trusting the declared type. */
function sniffImageType(bytes: Uint8Array): ImageType | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}

const EXTENSIONS: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export interface StoredImage {
  key: string;
  contentType: ImageType;
  size: number;
}

/** Validate an uploaded file and store it in R2 under `prefix/`. */
export async function storeImage(bucket: R2Bucket, file: unknown, prefix: string): Promise<StoredImage> {
  if (!(file instanceof File)) throw new HttpError(400, "An image file is required");
  if (file.size === 0) throw new HttpError(400, "The uploaded file is empty");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, `Images must be smaller than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new HttpError(415, "Only JPEG, PNG, WebP or AVIF images are allowed");

  const key = `${prefix}/${Date.now().toString(36)}-${randomToken(9)}.${EXTENSIONS[contentType]}`;
  await bucket.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
  });
  return { key, contentType, size: bytes.byteLength };
}

export async function deleteObjects(bucket: R2Bucket, keys: Array<string | null | undefined>): Promise<void> {
  const present = keys.filter((k): k is string => Boolean(k));
  if (present.length) await bucket.delete(present);
}

/** Serve an R2 object. Keys are opaque, so responses are immutable. */
export async function serveMedia(bucket: R2Bucket, key: string, request: Request): Promise<Response> {
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });
  const object = await bucket.get(key, { onlyIf: request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
