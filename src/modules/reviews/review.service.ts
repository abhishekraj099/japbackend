import { db } from "../../config/database.js";
import { AppError } from "../../lib/errors/AppError.js";
import { calculateNextReview } from "../../lib/srs/fsrs.js";
import { ScheduleState } from "../../lib/srs/srs.types.js";
import { SubmitReviewInput } from "./review.schema.js";

export class ReviewService {
  async getReviewsForUser(userId: string) {
    return await db.reviewLog.findMany({
      where: {
        card: {
          deck: { userId },
        },
      },
      include: { card: true },
      orderBy: { reviewedAt: "desc" },
    });
  }

  async getDueCards(userId: string, limit: number = 20) {
    return await db.card.findMany({
      where: {
        deck: { userId },
        schedule: {
          dueDate: { lte: new Date() },
        },
      },
      include: { schedule: true },
      take: limit,
    });
  }

  async submitReview(userId: string, input: SubmitReviewInput) {
    const card = await db.card.findUnique({
      where: { id: input.cardId },
      include: { deck: true, schedule: true },
    });

    if (!card || card.deck.userId !== userId) {
      throw new AppError(404, "Card not found", "CARD_NOT_FOUND");
    }

    const currentState: ScheduleState = card.schedule
      ? {
          stability: card.schedule.stability,
          difficulty: card.schedule.difficulty,
          reps: card.schedule.reps,
          lapses: card.schedule.lapses,
          state: card.schedule.state,
        }
      : { stability: 0, difficulty: 5, reps: 0, lapses: 0, state: "new" };

    const next = calculateNextReview(currentState, input.rating);

    const review = await db.reviewLog.create({
      data: {
        cardId: input.cardId,
        rating: input.rating,
        duration: input.duration,
      },
    });

    await db.cardSchedule.upsert({
      where: { cardId: input.cardId },
      create: { cardId: input.cardId, ...next },
      update: { ...next },
    });

    return review;
  }
}
