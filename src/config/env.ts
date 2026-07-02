import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRE: z.string().default("7d"), // legacy; superseded by ACCESS_TOKEN_TTL
  // Auth hardening (Phase 28.1).
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // AI fallback lookup (Phase 18A). Optional — when unset the AI endpoint
  // responds 503 and the extension simply shows "no result".
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  // AI provider layer (Phase 26A). Gemini is the only live provider today.
  GEMINI_API_KEY: z.string().optional(),
  // RC9.8: optional comma-separated pool of additional Gemini keys for
  // round-robin load balancing (e.g. "key1,key2,key3,key4,key5"). When set,
  // GEMINI_API_KEY (if also set) is included as the first key in the pool —
  // no key is defined twice. Falls back to single-key behavior when unset.
  GEMINI_API_KEYS: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  // AI daily quota by plan (Phase 26B) — cache misses / provider calls per day.
  AI_FREE_DAILY_LIMIT: z.coerce.number().default(20),
  AI_PREMIUM_DAILY_LIMIT: z.coerce.number().default(200),
  // Media object storage (Phase 27). When SUPABASE_URL + SUPABASE_SERVICE_KEY
  // are set, card screenshots/audio are uploaded to Supabase Storage and only a
  // public URL is stored. When unset, the extension keeps inlining data URLs
  // (legacy behavior) — fully backward compatible.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_MEDIA_BUCKET: z.string().default("card-media"),
  MEDIA_IMAGE_MAX_BYTES: z.coerce.number().default(2_000_000),
  MEDIA_AUDIO_MAX_BYTES: z.coerce.number().default(1_500_000),
});

export const env = envSchema.parse(process.env);
