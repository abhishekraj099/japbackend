import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import logger from "../../config/logger.js";

/**
 * Media object storage (Phase 27).
 *
 * Uploads card screenshots/native audio to Supabase Storage via its REST API
 * (no SDK dependency) and returns a public read URL. When storage is not
 * configured the caller falls back to inlining data URLs (legacy behavior),
 * so this is purely additive and backward compatible.
 */

export type MediaKind = "image" | "audio";

const IMAGE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const AUDIO_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

export function mediaConfigured(): boolean {
  return !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);
}

function publicBase(): string {
  return `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_MEDIA_BUCKET}/`;
}

/** True if a stored URL is a managed object in our bucket (vs a legacy data URL). */
export function isManagedUrl(url: string | null | undefined): boolean {
  return !!url && !!env.SUPABASE_URL && url.startsWith(publicBase());
}

interface ParsedDataUrl {
  mime: string;
  buffer: Buffer;
}

/** Parse + validate a `data:` URL against the kind's allow-list and size cap. */
export function parseAndValidate(kind: MediaKind, dataUrl: string): ParsedDataUrl {
  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) throw new ValidationError("Not a base64 data URL");
  const mime = m[1].toLowerCase();
  const table = kind === "image" ? IMAGE_MIME : AUDIO_MIME;
  if (!(mime in table)) throw new ValidationError(`Unsupported ${kind} type: ${mime}`);
  const buffer = Buffer.from(m[2], "base64");
  const max = kind === "image" ? env.MEDIA_IMAGE_MAX_BYTES : env.MEDIA_AUDIO_MAX_BYTES;
  if (buffer.length === 0) throw new ValidationError("Empty media");
  if (buffer.length > max) throw new ValidationError(`${kind} exceeds ${max} bytes`);
  return { mime, buffer };
}

export class ValidationError extends Error {}

/** Upload to Supabase Storage and return the public URL. */
export async function upload(userId: string, kind: MediaKind, dataUrl: string): Promise<string> {
  const { mime, buffer } = parseAndValidate(kind, dataUrl);
  const ext = (kind === "image" ? IMAGE_MIME : AUDIO_MIME)[mime];
  const path = `${userId}/${kind}/${randomUUID()}.${ext}`;
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_MEDIA_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": mime,
      "x-upsert": "false",
      "cache-control": "31536000",
    },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return `${publicBase()}${path}`;
}

/** Best-effort deletion of a managed object when its card is removed. */
export async function deleteByUrl(url: string | null | undefined): Promise<void> {
  if (!isManagedUrl(url)) return;
  const path = url!.slice(publicBase().length);
  try {
    await fetch(`${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_MEDIA_BUCKET}/${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });
  } catch (e) {
    logger.warn("media cleanup failed", { url, error: String(e) });
  }
}
