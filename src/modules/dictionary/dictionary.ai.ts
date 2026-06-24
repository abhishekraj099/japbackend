import { aiService } from "../ai/ai.service.js";
import type { AiSource } from "../ai/ai.service.js";
import type { DictionaryResult } from "./dictionary.types.js";

/**
 * AI fallback adapter (Phase 18 → 26B).
 *
 * Delegates to the AI provider/cache/quota layer and maps to the existing
 * response shapes, plus Phase 26B metadata (source / provider / remainingQuota /
 * quotaExceeded). No model API is called here.
 */

export function aiLookupAvailable(): boolean {
  return aiService.available();
}

export interface AiLookupResponse {
  result: DictionaryResult | null;
  source: AiSource;
  provider: string | null;
  remainingQuota: number;
  quotaExceeded: boolean;
}

export async function aiLookup(query: string, userId: string): Promise<AiLookupResponse> {
  const out = await aiService.lookupWord(query, userId);
  const q = query.trim();
  const result: DictionaryResult | null =
    out.result && out.result.meaning
      ? {
          id: `ai:${q}`,
          word: q,
          reading: out.result.reading,
          meanings: [out.result.meaning],
          jlptLevel: out.result.jlptLevel,
          partOfSpeech: out.result.category ?? null,
          frequency: null,
          commonWord: false,
          pitchAccent: out.result.pitchAccent ?? null,
          source: "ai",
        }
      : null;
  return { result, source: out.source, provider: out.provider, remainingQuota: out.remainingQuota, quotaExceeded: out.quotaExceeded };
}

export interface AiSentenceResponse {
  reading: string | null;
  translation: string | null;
  source: AiSource;
  provider: string | null;
  remainingQuota: number;
  quotaExceeded: boolean;
  ok: boolean;
}

export async function aiSentence(query: string, userId: string): Promise<AiSentenceResponse> {
  const out = await aiService.lookupSentence(query, userId);
  const ok = !!(out.result && out.result.translation);
  return {
    reading: out.result?.reading ?? null,
    translation: out.result?.translation ?? null,
    source: out.source,
    provider: out.provider,
    remainingQuota: out.remainingQuota,
    quotaExceeded: out.quotaExceeded,
    ok,
  };
}
