import { aiProviderManager } from "./provider-manager.js";
import { aiCacheService } from "./ai-cache.service.js";
import { normalizeQuery } from "./normalize.js";
import type { AIWordResult, AISentenceResult } from "./ai.types.js";

/**
 * AI orchestration (Phase 26A). Implements the lookup flow:
 *   normalize → cache → (miss) record usage → provider → validate → cache → return
 *
 * Transparent to callers: returns the same result whether served from cache or
 * a fresh provider call. Failures are never cached and never block the app.
 */
class AiService {
  /** True when any AI provider is configured. */
  available(): boolean {
    return aiProviderManager.isAvailable();
  }

  async lookupWord(query: string, userId = "anonymous"): Promise<AIWordResult | null> {
    const normalized = normalizeQuery(query);
    if (!normalized) return null;

    const cached = await aiCacheService.getWord(normalized);
    if (cached) return cached; // cache hit — no usage, no AI call

    if (!aiProviderManager.isAvailable()) return null;

    await aiCacheService.recordUsage(userId); // cache miss → counts toward usage
    const hit = await aiProviderManager.lookupWord(query);
    if (!hit || !hit.result.meaning) return null; // failure/invalid → not cached

    await aiCacheService.saveWord(query, normalized, hit.result, hit.provider);
    return hit.result;
  }

  async lookupSentence(query: string, userId = "anonymous"): Promise<AISentenceResult | null> {
    const normalized = normalizeQuery(query);
    if (!normalized) return null;

    const cached = await aiCacheService.getSentence(normalized);
    if (cached) return cached;

    if (!aiProviderManager.isAvailable()) return null;

    await aiCacheService.recordUsage(userId);
    const hit = await aiProviderManager.lookupSentence(query);
    if (!hit || !hit.result.translation) return null;

    await aiCacheService.saveSentence(query, normalized, hit.result, hit.provider);
    return hit.result;
  }
}

export const aiService = new AiService();
