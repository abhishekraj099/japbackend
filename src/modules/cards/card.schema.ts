import { z } from "zod";

export const createCardSchema = z.object({
  deckId: z.string().cuid(),
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(1000),
  tags: z.array(z.string()).optional(),
  sourceType: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  contextSentence: z.string().max(1000).optional(),
});

export const updateCardSchema = z.object({
  question: z.string().min(1).max(1000).optional(),
  answer: z.string().min(1).max(1000).optional(),
  tags: z.array(z.string()).optional(),
  sourceType: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  contextSentence: z.string().max(1000).optional(),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
