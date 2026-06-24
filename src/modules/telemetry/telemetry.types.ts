import { z } from "zod";

/** Closed event vocabulary → bounded row cardinality + no arbitrary strings. */
export const TELEMETRY_EVENTS = [
  "provider_matched",
  "cue_extracted",
  "health_warning",
  "selector_fallback",
  "replay_success",
  "replay_failure",
  "screenshot_success",
  "screenshot_failure",
  "audio_success",
  "audio_failure",
  "ai_fallback",
  "ai_quota_exceeded",
] as const;

export const TELEMETRY_PLATFORMS = ["youtube", "netflix", "viki", "ai", "other"] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];
export type TelemetryPlatform = (typeof TELEMETRY_PLATFORMS)[number];

// Ingest body: client sends pre-aggregated counts. No subtitle text, no PII,
// no timestamps (server stamps the date). Unknown events/platforms are rejected.
export const telemetryIngestSchema = z.object({
  events: z
    .array(
      z.object({
        platform: z.enum(TELEMETRY_PLATFORMS),
        event: z.enum(TELEMETRY_EVENTS),
        count: z.number().int().min(1).max(100000),
      })
    )
    .min(1)
    .max(200),
});

export type TelemetryIngest = z.infer<typeof telemetryIngestSchema>;

// ── Synthetic provider health checks (Phase 25I.3) ───────────────────────────
export const HEALTH_PROVIDERS = ["youtube", "netflix", "viki"] as const;
export type HealthProvider = (typeof HEALTH_PROVIDERS)[number];

export const healthIngestSchema = z.object({
  results: z
    .array(
      z.object({
        provider: z.enum(HEALTH_PROVIDERS),
        healthy: z.boolean(),
        checksPassed: z.number().int().min(0).max(100),
        checksFailed: z.number().int().min(0).max(100),
      })
    )
    .min(1)
    .max(20),
});
export type HealthIngest = z.infer<typeof healthIngestSchema>;

// Alert thresholds (consecutive failed runs).
export const ALERT_WARNING = 2;
export const ALERT_CRITICAL = 5;
