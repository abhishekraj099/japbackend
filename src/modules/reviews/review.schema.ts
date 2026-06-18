import { z } from "zod";

export const submitReviewSchema = z.object({
  cardId: z.string().cuid(),
  rating: z.number().min(0).max(5),
  duration: z.number().min(0),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
