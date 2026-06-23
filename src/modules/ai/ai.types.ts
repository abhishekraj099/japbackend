/**
 * AI provider layer types (Phase 26A).
 *
 * Every AI request flows through an AIProvider implementation behind the
 * AIProviderManager. No code outside the provider layer talks to a model API
 * directly.
 */

export interface AIWordResult {
  reading: string | null;
  meaning: string | null; // primary English gloss (required for a valid result)
  examples: string[];
  jlptLevel: string | null;
  pitchAccent: string | null;
  category: string | null; // part of speech / category
}

export interface AISentenceResult {
  reading: string | null;
  translation: string | null; // required for a valid result
}

export interface AIProvider {
  /** Stable identifier stored on cache entries (e.g. "gemini"). */
  readonly name: string;
  /** True when this provider is configured and usable. */
  isAvailable(): boolean;
  /** Look up a single word/term. Returns null on failure (never throws). */
  lookupWord(query: string): Promise<AIWordResult | null>;
  /** Look up a sentence's reading + translation. Returns null on failure. */
  lookupSentence(query: string): Promise<AISentenceResult | null>;
}
