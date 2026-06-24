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
