import { db } from "../../config/database.js";
import { TELEMETRY_PLATFORMS, type TelemetryIngest } from "./telemetry.types.js";

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
}

export const telemetryService = new TelemetryService();
