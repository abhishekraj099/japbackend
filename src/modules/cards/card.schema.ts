import { z } from "zod";

const enrichmentFields = {
  reading: z.string().max(500).optional(),
  meaning: z.string().max(1000).optional(),
  grammarNotes: z.string().max(2000).optional(),
  jlptLevel: z.enum(["N5", "N4", "N3", "N2", "N1"]).optional(),
  frequency: z.number().int().nonnegative().optional(),
  pitchAccent: z.string().max(50).optional(),
  sourceType: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  contextSentence: z.string().max(1000).optional(),
  examples: z.array(z.string().max(500)).max(10).optional(),
};

export const createCardSchema = z.object({
  deckId: z.string().cuid(),
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(1000),
  tags: z.array(z.string()).optional(),
  ...enrichmentFields,
});

export const updateCardSchema = z.object({
  question: z.string().min(1).max(1000).optional(),
  answer: z.string().min(1).max(1000).optional(),
  tags: z.array(z.string()).optional(),
  ...enrichmentFields,
});

/**
 * Grammar flashcard creation. Distinct payload from vocabulary cards — the
 * client sends the detected grammar pattern; the service maps it onto the
 * shared Card table with cardType "grammar". deckId is optional: when omitted
 * the service falls back to the user's first deck (mirrors the extension's
 * vocabulary save flow).
 */
export const createGrammarCardSchema = z.object({
  deckId: z.string().cuid().optional(),
  patternId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  jlptLevel: z.enum(["N5", "N4", "N3", "N2", "N1"]).optional(),
  explanation: z.string().min(1).max(1000),
  detail: z.string().max(2000).optional(),
  examples: z.array(z.string().max(500)).max(10).optional(),
  sourceUrl: z.string().url().optional(),
  contextSentence: z.string().max(1000).optional(),
});

/**
 * Sentence flashcard creation. Like grammar cards, sentences map onto the
 * shared Card table (cardType "sentence"): sentenceText -> question,
 * translation -> answer, with reading/examples reusing the existing columns.
 * deckId is optional and falls back to the user's first deck.
 */
export const createSentenceCardSchema = z.object({
  deckId: z.string().cuid().optional(),
  sentenceText: z.string().min(1).max(1000),
  translation: z.string().min(1).max(1000),
  reading: z.string().max(1000).optional(),
  examples: z.array(z.string().max(500)).max(10).optional(),
  sourceUrl: z.string().url().optional(),
  contextSentence: z.string().max(1000).optional(),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type CreateGrammarCardInput = z.infer<typeof createGrammarCardSchema>;
export type CreateSentenceCardInput = z.infer<typeof createSentenceCardSchema>;
