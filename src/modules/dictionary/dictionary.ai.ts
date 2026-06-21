import { env } from "../../config/env.js";
import logger from "../../config/logger.js";
import type { DictionaryResult } from "./dictionary.types.js";

/**
 * AI fallback lookup (Phase 18A).
 *
 * When the local JMdict has no entry (common for compounds/dates like 一月,
 * 二月 …), ask Claude for a concise reading / meaning / JLPT estimate /
 * category and return it shaped like a DictionaryResult with source = "ai".
 *
 * Uses a direct fetch to the Anthropic Messages API (no SDK dependency). When
 * ANTHROPIC_API_KEY is unset the caller surfaces 503 and the client shows
 * "no result". Results are cached in-process to avoid repeat token spend.
 */

interface AiFields {
  reading: string | null;
  meaning: string | null;
  jlptLevel: string | null;
  category: string | null;
}

const cache = new Map<string, DictionaryResult | null>();
const MAX_CACHE = 500;

export function aiLookupAvailable(): boolean {
  return !!env.ANTHROPIC_API_KEY;
}

const SYSTEM_PROMPT =
  "You are a precise Japanese-English dictionary. Given a single Japanese term, " +
  "respond with ONLY a compact JSON object and nothing else, shaped exactly as: " +
  '{"reading": string (hiragana, "" if none), "meaning": string (concise English gloss), ' +
  '"jlptLevel": "N5"|"N4"|"N3"|"N2"|"N1"|null, "category": string (e.g. "noun", "date", "counter", "expression")}. ' +
  "If the term is not valid Japanese, set meaning to an empty string.";

function parseAi(text: string): AiFields | null {
  // Be tolerant of code fences / stray prose around the JSON.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Partial<AiFields>;
    return {
      reading: o.reading?.trim() || null,
      meaning: o.meaning?.trim() || null,
      jlptLevel: o.jlptLevel ?? null,
      category: o.category?.trim() || null,
    };
  } catch {
    return null;
  }
}

// ── Sentence reading + translation (Phase 18D AI fallback) ───────────────────

export interface AiSentence {
  reading: string | null;
  translation: string | null;
}

const sentenceCache = new Map<string, AiSentence | null>();

const SENTENCE_SYSTEM_PROMPT =
  "You are a precise Japanese-English assistant. Given a Japanese sentence, " +
  "respond with ONLY a compact JSON object and nothing else, shaped exactly as: " +
  '{"reading": string (full hiragana reading of the sentence), "translation": string (natural English translation)}.';

/** Low-level single-message Anthropic call returning the raw text, or null. */
async function callClaude(system: string, user: string, maxTokens: number): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      logger.warn("AI call HTTP error", { status: res.status });
      return null;
    }
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.map((c) => c.text ?? "").join("") ?? "";
  } catch (err) {
    logger.warn("AI call failed", { error: (err as Error).message });
    return null;
  }
}

export async function aiSentence(query: string): Promise<AiSentence | null> {
  const q = query.trim();
  if (!q || !env.ANTHROPIC_API_KEY) return null;
  if (sentenceCache.has(q)) return sentenceCache.get(q)!;

  const text = await callClaude(SENTENCE_SYSTEM_PROMPT, q, 1024);
  let result: AiSentence | null = null;
  if (text) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const o = JSON.parse(m[0]) as Partial<AiSentence>;
        result = {
          reading: o.reading?.trim() || null,
          translation: o.translation?.trim() || null,
        };
      } catch { /* leave null */ }
    }
  }
  if (result) {
    if (sentenceCache.size >= MAX_CACHE) sentenceCache.clear();
    sentenceCache.set(q, result);
  }
  return result;
}

export async function aiLookup(query: string): Promise<DictionaryResult | null> {
  const q = query.trim();
  if (!q) return null;
  if (!env.ANTHROPIC_API_KEY) return null;
  if (cache.has(q)) return cache.get(q)!;

  let result: DictionaryResult | null = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: q }],
      }),
    });

    if (!res.ok) {
      logger.warn("AI lookup HTTP error", { status: res.status });
      return null; // not cached — transient errors should be retryable
    }

    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    const fields = parseAi(text);

    if (fields && fields.meaning) {
      result = {
        id: `ai:${q}`,
        word: q,
        reading: fields.reading,
        meanings: [fields.meaning],
        jlptLevel: fields.jlptLevel,
        partOfSpeech: fields.category,
        frequency: null,
        commonWord: false,
        pitchAccent: null,
        source: "ai",
      };
    }
  } catch (err) {
    logger.warn("AI lookup failed", { error: (err as Error).message });
    return null;
  }

  // Cache the resolved outcome (including a confirmed null) to cap token spend.
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(q, result);
  return result;
}
