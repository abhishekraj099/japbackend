import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRE: z.string().default("7d"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  CORS_ORIGIN: z.string().url().default("http://localhost:3001"),
});

export const env = envSchema.parse(process.env);
