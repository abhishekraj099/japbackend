import { Prisma } from "@prisma/client";
import { db } from "../../config/database.js";
import { AppError } from "../../lib/errors/AppError.js";
import { calculateNextReview } from "../../lib/srs/fsrs.js";
import { ScheduleState } from "../../lib/srs/srs.types.js";
import { SubmitReviewInput, BatchReviewInput } from "./review.schema.js";

/** Server-enforced ceilings (Phase 21D). */
const DUE_LIMIT_MAX = 100;
const HISTORY_LIMIT_MAX = 100;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export class ReviewService {
  /** Paginated review history (Phase 21D). */
  async getReviewsForUser(userId: string, page = 1, limit = 50) {
    const take = Math.min(Math.max(limit, 1), HISTORY_LIMIT_MAX);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * take;
    const where = { card: { deck: { userId } } };
    const [reviews, total] = await Promise.all([
      db.reviewLog.findMany({ where, include: { card: true }, orderBy: { reviewedAt: "desc" }, skip, take }),
      db.reviewLog.count({ where }),
    ]);
    return { reviews, total, page: safePage, limit: take, hasMore: skip + reviews.length < total };
  }

  async getDueCards(userId: string, limit: number = 20) {
    const take = Math.min(Math.max(limit, 1), DUE_LIMIT_MAX);
    return await db.card.findMany({
      where: {
        deck: { userId },
        schedule: {
          dueDate: { lte: new Date() },
        },
      },
      include: { schedule: true },
      take,
    });
  }

  /**
   * Apply a batch of reviews (Phase 21B): in reviewedAt order, idempotent by
   * clientReviewId (duplicates ignored). Returns per-outcome counts.
   */
  async submitBatch(userId: string, input: BatchReviewInput) {
    const sorted = [...input.reviews].sort(
      (a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime()
    );

    // Pre-load any clientReviewIds already stored → idempotent replays.
    const existing = await db.reviewLog.findMany({
      where: { clientReviewId: { in: sorted.map((r) => r.clientReviewId) } },
      select: { clientReviewId: true },
    });
    const seen = new Set(existing.map((e) => e.clientReviewId!));

    let applied = 0;
    let duplicate = 0;
    let skipped = 0;

    for (const r of sorted) {
      if (seen.has(r.clientReviewId)) { duplicate++; continue; }
      seen.add(r.clientReviewId);

      const card = await db.card.findUnique({
        where: { id: r.cardId },
        include: { deck: true, schedule: true },
      });
      if (!card || card.deck.userId !== userId) { skipped++; continue; }

      const currentState: ScheduleState = card.schedule
        ? {
            stability: card.schedule.stability,
            difficulty: card.schedule.difficulty,
            reps: card.schedule.reps,
            lapses: card.schedule.lapses,
            state: card.schedule.state,
          }
        : { stability: 0, difficulty: 5, reps: 0, lapses: 0, state: "new" };

      const next = calculateNextReview(currentState, r.rating);

      try {
        await db.reviewLog.create({
          data: {
            cardId: r.cardId,
            rating: r.rating,
            duration: r.duration,
            clientReviewId: r.clientReviewId,
            reviewedAt: new Date(r.reviewedAt),
          },
        });
      } catch (e) {
        // Lost a race on the unique clientReviewId — treat as a duplicate.
        if (isUniqueViolation(e)) { duplicate++; continue; }
        throw e;
      }

      await db.cardSchedule.upsert({
        where: { cardId: r.cardId },
        create: { cardId: r.cardId, ...next },
        update: { ...next },
      });
      applied++;
    }

    return { applied, duplicate, skipped, total: sorted.length };
  }

  /** Dashboard metrics (Phase 21E). */
  async getStats(userId: string) {
    const cardWhere = { deck: { userId } };
    const [totalCards, vocabCount, grammarCount, sentenceCount, totalReviews] = await Promise.all([
      db.card.count({ where: cardWhere }),
      db.card.count({ where: { ...cardWhere, cardType: "vocab" } }),
      db.card.count({ where: { ...cardWhere, cardType: "grammar" } }),
      db.card.count({ where: { ...cardWhere, cardType: "sentence" } }),
      db.reviewLog.count({ where: { card: { deck: { userId } } } }),
    ]);
    const currentStreak = await this.currentStreak(userId);
    return { totalCards, vocabCount, grammarCount, sentenceCount, totalReviews, currentStreak };
  }

  /** Consecutive days (UTC) with ≥1 review, ending today or yesterday. */
  private async currentStreak(userId: string): Promise<number> {
    const rows = await db.$queryRaw<{ d: Date }[]>`
      SELECT DISTINCT (rl."reviewedAt" AT TIME ZONE 'UTC')::date AS d
      FROM review_logs rl
      JOIN cards c ON c.id = rl."cardId"
      JOIN decks dk ON dk.id = c."deckId"
      WHERE dk."userId" = ${userId}
      ORDER BY d DESC
    `;
    if (rows.length === 0) return 0;

    const dayMs = 86400000;
    const toUtcDay = (date: Date) =>
      Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / dayMs);
    const today = toUtcDay(new Date());
    const days = rows.map((r) => toUtcDay(new Date(r.d)));

    // Allow the streak to be "alive" if the latest review was today or yesterday.
    if (today - days[0] > 1) return 0;
    let streak = 1;
    for (let i = 1; i < days.length; i++) {
      if (days[i - 1] - days[i] === 1) streak++;
      else break;
    }
    return streak;
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
