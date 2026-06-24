import { env } from "../../../config/env.js";
import logger from "../../../config/logger.js";
import type {
  AIProvider,
  AIWordResult,
  AISentenceResult,
  GrammarAssistantInput,
  GrammarAssistantResult,
} from "../ai.types.js";

/**
 * Gemini provider (Phase 26A) — the only live AI provider today.
 *
 * Talks to the Google Generative Language API directly (no SDK). This is the
 * ONLY place in the codebase that calls Gemini; all callers go through
 * AIProviderManager. Returns null on any failure (never throws) so the cache
 * layer can avoid storing failures.
 */

const WORD_PROMPT =
  "You are a precise Japanese-English dictionary. Given a single Japanese term, " +
  "respond with ONLY a compact JSON object and nothing else, shaped exactly as: " +
  '{"reading": string (hiragana, "" if none), "meaning": string (concise English gloss), ' +
  '"jlptLevel": "N5"|"N4"|"N3"|"N2"|"N1"|null, "category": string (e.g. "noun", "date", "counter", "expression")}. ' +
  "If the term is not valid Japanese, set meaning to an empty string.";

const SENTENCE_PROMPT =
  "You are a precise Japanese-English assistant. Given a Japanese sentence, " +
  "respond with ONLY a compact JSON object and nothing else, shaped exactly as: " +
  '{"reading": string (full hiragana reading of the sentence), "translation": string (natural English translation)}.';

// Grammar Assistant (Phase 36) — structured JSON only, no markdown.
const GRAMMAR_SHAPE =
  'Respond with ONLY a compact JSON object and nothing else, shaped exactly as: ' +
  '{"title": string, "explanation": string, "examples": string[] (2-3 items, each "日本語 — English"), ' +
  '"confidence": "high"|"medium"|"low"}.';
const GRAMMAR_PROMPTS: Record<GrammarAssistantInput["questionType"], string> = {
  explain:
    "You are a precise Japanese grammar teacher. Explain the given Japanese grammar pattern: its meaning, " +
    "when it is used, and the nuance it adds (2-4 sentences). " + GRAMMAR_SHAPE,
  compare:
    "You are a precise Japanese grammar teacher. Compare the given Japanese grammar patterns, focusing on the " +
    "differences in nuance, register, and usage. " + GRAMMAR_SHAPE,
  breakdown:
    "You are a precise Japanese grammar teacher. Break down the given Japanese sentence: the role of each part, " +
    "the grammar points involved, a natural English translation, and any nuance — as clear prose in `explanation`. " +
    GRAMMAR_SHAPE,
};

function extractJson<T>(text: string): Partial<T> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Partial<T>;
  } catch {
    return null;
  }
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  isAvailable(): boolean {
    return !!env.GEMINI_API_KEY;
  }

  /** Single-shot generateContent call. Returns the model text, or null. */
  private async call(system: string, user: string, maxTokens: number): Promise<string | null> {
    if (!env.GEMINI_API_KEY) return null;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
          },
        }),
      });
      if (!res.ok) {
        logger.warn("Gemini HTTP error", { status: res.status });
        return null;
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    } catch (err) {
      logger.warn("Gemini call failed", { error: (err as Error).message });
      return null;
    }
  }

  async lookupWord(query: string): Promise<AIWordResult | null> {
    const text = await this.call(WORD_PROMPT, query.trim(), 256);
    if (!text) return null;
    const o = extractJson<{
      reading: string;
      meaning: string;
      jlptLevel: string;
      category: string;
    }>(text);
    if (!o) return null;
    return {
      reading: o.reading?.trim() || null,
      meaning: o.meaning?.trim() || null,
      examples: [],
      jlptLevel: o.jlptLevel ?? null,
      pitchAccent: null,
      category: o.category?.trim() || null,
    };
  }

  async lookupSentence(query: string): Promise<AISentenceResult | null> {
    const text = await this.call(SENTENCE_PROMPT, query.trim(), 1024);
    if (!text) return null;
    const o = extractJson<{ reading: string; translation: string }>(text);
    if (!o) return null;
    return {
      reading: o.reading?.trim() || null,
      translation: o.translation?.trim() || null,
    };
  }

  async lookupGrammar(input: GrammarAssistantInput): Promise<GrammarAssistantResult | null> {
    const user = input.pattern ? `Pattern: ${input.pattern}\n${input.text.trim()}` : input.text.trim();
    const text = await this.call(GRAMMAR_PROMPTS[input.questionType], user, 1024);
    if (!text) return null;
    const o = extractJson<{ title: string; explanation: string; examples: string[]; confidence: string }>(text);
    if (!o || !o.explanation?.trim()) return null;
    const confidence = o.confidence === "high" || o.confidence === "low" ? o.confidence : "medium";
    return {
      title: o.title?.trim() || input.text.trim(),
      explanation: o.explanation.trim(),
      examples: Array.isArray(o.examples) ? o.examples.filter((e) => typeof e === "string").slice(0, 3) : [],
      confidence,
    };
  }
}
