import { db } from "../../config/database.js";
import {
  TELEMETRY_PLATFORMS,
  HEALTH_PROVIDERS,
  ALERT_WARNING,
  ALERT_CRITICAL,
  type TelemetryIngest,
  type HealthIngest,
} from "./telemetry.types.js";

const today = () => new Date().toISOString().slice(0, 10);
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

class TelemetryService {
  /** Increment pre-aggregated daily counters (server-stamped date). */
  async ingest(payload: TelemetryIngest): Promise<void> {
    const date = today();
    await Promise.all(
      payload.events.map(({ platform, event, count }) =>
        db.telemetryDaily.upsert({
          where: { date_platform_event: { date, platform, event } },
          create: { date, platform, event, count },
          update: { count: { increment: count } },
        })
      )
    );
  }

  /** Dashboard metrics aggregated over the last `days` (inclusive of today). */
  async metrics(days: number) {
    const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const rows = await db.telemetryDaily.findMany({
      where: { date: { gte: since } },
      select: { date: true, platform: true, event: true, count: true },
    });

    // platform -> event -> total
    const agg: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      (agg[r.platform] ??= {})[r.event] = (agg[r.platform]?.[r.event] ?? 0) + r.count;
    }
    const get = (p: string, e: string) => agg[p]?.[e] ?? 0;

    const platforms = TELEMETRY_PLATFORMS.filter((p) => p !== "ai").map((p) => {
      const matched = get(p, "provider_matched");
      const cue = get(p, "cue_extracted");
      const warn = get(p, "health_warning");
      const fallback = get(p, "selector_fallback");
      const rOk = get(p, "replay_success");
      const rFail = get(p, "replay_failure");
      const sOk = get(p, "screenshot_success");
      const sFail = get(p, "screenshot_failure");
      const aOk = get(p, "audio_success");
      const aFail = get(p, "audio_failure");
      return {
        platform: p,
        providerMatched: matched,
        cueExtracted: cue,
        // "uptime" = sessions that produced a readable cue out of provider matches.
        cueExtractionSuccessPct: pct(Math.min(cue, matched), matched),
        warningRatePct: pct(warn, matched),
        selectorFallbacks: fallback,
        replaySuccessPct: pct(rOk, rOk + rFail),
        screenshotSuccessPct: pct(sOk, sOk + sFail),
        audioMiningSuccessPct: pct(aOk, aOk + aFail),
      };
    });

    const aiFallback = get("ai", "ai_fallback");
    const aiQuota = get("ai", "ai_quota_exceeded");

    return {
      rangeDays: days,
      since,
      platforms,
      ai: {
        fallbackLookups: aiFallback,
        quotaExceeded: aiQuota,
        quotaFailureRatePct: pct(aiQuota, aiFallback + aiQuota),
      },
    };
  }

  // ── Synthetic health checks (Phase 25I.3) ──────────────────────────────────
  async recordHealth(payload: HealthIngest): Promise<void> {
    await db.providerHealthCheck.createMany({ data: payload.results });
  }

  /** Per-provider monitoring summary + alert level over the last `days`. */
  async healthMetrics(days: number) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await db.providerHealthCheck.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { provider: true, healthy: true, checksPassed: true, checksFailed: true, createdAt: true },
    });

    const providers = HEALTH_PROVIDERS.map((provider) => {
      const runs = rows.filter((r) => r.provider === provider); // newest first
      const total = runs.length;
      const healthyCount = runs.filter((r) => r.healthy).length;
      const lastSuccessfulCheck = runs.find((r) => r.healthy)?.createdAt ?? null;
      let consecutiveFailures = 0;
      for (const r of runs) {
        if (r.healthy) break;
        consecutiveFailures++;
      }
      const alertLevel =
        consecutiveFailures >= ALERT_CRITICAL ? "critical" : consecutiveFailures >= ALERT_WARNING ? "warning" : "ok";
      return {
        provider,
        totalChecks: total,
        uptimePct: pct(healthyCount, total),
        lastSuccessfulCheck,
        lastChecked: runs[0]?.createdAt ?? null,
        consecutiveFailures,
        alertLevel,
      };
    });

    return {
      rangeDays: days,
      providers,
      unhealthyProviders: providers.filter((p) => p.alertLevel !== "ok").map((p) => p.provider),
      thresholds: { warning: ALERT_WARNING, critical: ALERT_CRITICAL },
    };
  }
}

export const telemetryService = new TelemetryService();
