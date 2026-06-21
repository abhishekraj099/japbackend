import { z } from "zod";

export const submitReviewSchema = z.object({
  cardId: z.string().cuid(),
  rating: z.number().min(0).max(5),
  duration: z.number().min(0),
});

/** Offline-friendly batch submit (Phase 21B). */
export const batchReviewSchema = z.object({
  reviews: z
    .array(
      z.object({
        clientReviewId: z.string().min(1).max(100),
        cardId: z.string().cuid(),
        rating: z.number().min(0).max(5),
        duration: z.number().min(0),
        reviewedAt: z.string().datetime(),
      })
    )
    .min(1)
    .max(500),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
export type BatchReviewInput = z.infer<typeof batchReviewSchema>;
