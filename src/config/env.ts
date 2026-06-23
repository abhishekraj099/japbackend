import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRE: z.string().default("7d"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // AI fallback lookup (Phase 18A). Optional — when unset the AI endpoint
  // responds 503 and the extension simply shows "no result".
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  // AI provider layer (Phase 26A). Gemini is the only live provider today.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
});

export const env = envSchema.parse(process.env);
