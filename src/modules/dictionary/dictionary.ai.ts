import { aiService } from "../ai/ai.service.js";
import type { DictionaryResult } from "./dictionary.types.js";

/**
 * AI fallback adapter (Phase 18A/18D, rearchitected in Phase 26A).
 *
 * This module no longer talks to any model API directly — it delegates to the
 * AI provider layer (cache → AIProviderManager → Gemini) and maps the result
 * to the existing response shapes. Public function signatures and response
 * shapes are unchanged so the controller/extension/web keep working.
 */

export function aiLookupAvailable(): boolean {
  return aiService.available();
}

export async function aiLookup(query: string, userId = "anonymous"): Promise<DictionaryResult | null> {
  const r = await aiService.lookupWord(query, userId);
  if (!r || !r.meaning) return null;
  const q = query.trim();
  return {
    id: `ai:${q}`,
    word: q,
    reading: r.reading,
    meanings: [r.meaning],
    jlptLevel: r.jlptLevel,
    partOfSpeech: r.category ?? null,
    frequency: null,
    commonWord: false,
    pitchAccent: r.pitchAccent ?? null,
    source: "ai",
  };
}

export interface AiSentence {
  reading: string | null;
  translation: string | null;
}

export async function aiSentence(query: string, userId = "anonymous"): Promise<AiSentence | null> {
  const r = await aiService.lookupSentence(query, userId);
  if (!r || !r.translation) return null;
  return { reading: r.reading, translation: r.translation };
}
