import { db } from "../../config/database.js";
import { env } from "../../config/env.js";
import { aiProviderManager } from "./provider-manager.js";
import { aiCacheService } from "./ai-cache.service.js";
import { normalizeQuery } from "./normalize.js";
import type { AIWordResult, AISentenceResult } from "./ai.types.js";

/**
 * AI orchestration (Phase 26A + 26B). Flow:
 *   normalize → cache → (miss) quota check → record usage → provider →
 *   validate → cache → return.
 *
 * Quota (Phase 26B) is consumed ONLY on a cache miss that attempts a provider
 * call. Dictionary hits (elsewhere) and AI cache hits never consume quota.
 */

export type AiSource = "ai-cache" | "ai";

export interface AiWordOutcome {
  result: AIWordResult | null;
  source: AiSource;
  provider: string | null;
  remainingQuota: number;
  quotaExceeded: boolean;
}
export interface AiSentenceOutcome {
  result: AISentenceResult | null;
  source: AiSource;
  provider: string | null;
  remainingQuota: number;
  quotaExceeded: boolean;
}

class AiService {
  available(): boolean {
    return aiProviderManager.isAvailable();
  }

  /** Plan-aware daily limit + today's usage for a user. */
  private async quota(userId: string): Promise<{ limit: number; used: number }> {
    const [user, usage] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { plan: true } }),
      db.aiUsage.findUnique({
        where: { userId_date: { userId, date: new Date().toISOString().slice(0, 10) } },
        select: { requestCount: true },
      }),
    ]);
    const limit = user?.plan === "PREMIUM" ? env.AI_PREMIUM_DAILY_LIMIT : env.AI_FREE_DAILY_LIMIT;
    return { limit, used: usage?.requestCount ?? 0 };
  }

  async lookupWord(query: string, userId: string): Promise<AiWordOutcome> {
    const normalized = normalizeQuery(query);
    const { limit, used } = await this.quota(userId);
    const remaining = (u: number) => Math.max(0, limit - u);

    if (normalized) {
      const cached = await aiCacheService.getWord(normalized);
      if (cached) {
        return { result: cached.result, source: "ai-cache", provider: cached.provider, remainingQuota: remaining(used), quotaExceeded: false };
      }
    }
    // Cache miss → provider call needed.
    if (!normalized || !aiProviderManager.isAvailable()) {
      return { result: null, source: "ai", provider: null, remainingQuota: remaining(used), quotaExceeded: false };
    }
    if (used >= limit) {
      return { result: null, source: "ai", provider: null, remainingQuota: 0, quotaExceeded: true };
    }
    await aiCacheService.recordUsage(userId); // a real provider request is attempted
    const hit = await aiProviderManager.lookupWord(query);
    if (!hit || !hit.result.meaning) {
      return { result: null, source: "ai", provider: null, remainingQuota: remaining(used + 1), quotaExceeded: false };
    }
    await aiCacheService.saveWord(query, normalized, hit.result, hit.provider);
    return { result: hit.result, source: "ai", provider: hit.provider, remainingQuota: remaining(used + 1), quotaExceeded: false };
  }

  async lookupSentence(query: string, userId: string): Promise<AiSentenceOutcome> {
    const normalized = normalizeQuery(query);
    const { limit, used } = await this.quota(userId);
    const remaining = (u: number) => Math.max(0, limit - u);

    if (normalized) {
      const cached = await aiCacheService.getSentence(normalized);
      if (cached) {
        return { result: cached.result, source: "ai-cache", provider: cached.provider, remainingQuota: remaining(used), quotaExceeded: false };
      }
    }
    if (!normalized || !aiProviderManager.isAvailable()) {
      return { result: null, source: "ai", provider: null, remainingQuota: remaining(used), quotaExceeded: false };
    }
    if (used >= limit) {
      return { result: null, source: "ai", provider: null, remainingQuota: 0, quotaExceeded: true };
    }
    await aiCacheService.recordUsage(userId);
    const hit = await aiProviderManager.lookupSentence(query);
    if (!hit || !hit.result.translation) {
      return { result: null, source: "ai", provider: null, remainingQuota: remaining(used + 1), quotaExceeded: false };
    }
    await aiCacheService.saveSentence(query, normalized, hit.result, hit.provider);
    return { result: hit.result, source: "ai", provider: hit.provider, remainingQuota: remaining(used + 1), quotaExceeded: false };
  }
}

export const aiService = new AiService();
