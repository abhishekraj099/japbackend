/**
 * Cache-key normalization (Phase 26A).
 *
 * Produces a stable key for the AI cache so identical/equivalent lookups share
 * one entry. Applies Unicode NFKC (folds full-width → half-width, etc.), trims,
 * collapses internal whitespace and lowercases Latin text.
 *
 * NOTE: deep lemmatization (食べます/食べた/食べている → 食べる) requires the
 * kuromoji tokenizer + deinflection rules, which live client-side in the
 * extension and already run BEFORE the AI fallback is reached. The extension
 * therefore sends base forms where possible; this backend normalizer guarantees
 * a consistent key for repeated queries (the core cache-hit case) without
 * shipping the tokenizer to the server. A future phase can port the deinflector
 * here if cross-inflection cache sharing becomes valuable.
 */
export function normalizeQuery(query: string): string {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
