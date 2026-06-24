import { Prisma } from "@prisma/client";
import { db } from "../../config/database.js";
import { AppError } from "../../lib/errors/AppError.js";
import {
  CreateCardInput,
  UpdateCardInput,
  CreateGrammarCardInput,
  CreateSentenceCardInput,
} from "./card.schema.js";

/** True for a Postgres unique-constraint violation (Prisma P2002). */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export class CardService {
  /**
   * Create a vocabulary flashcard. Idempotent per (user, question): if the
   * same word is already saved in any of the user's decks, the existing card
   * is returned with `alreadySaved: true` instead of inserting a duplicate —
   * mirroring the grammar-card dedup.
   */
  async create(userId: string, input: CreateCardInput) {
    const deck = await db.deck.findFirst({
      where: { id: input.deckId, userId },
    });

    if (!deck) {
      throw new AppError(404, "Deck not found", "DECK_NOT_FOUND");
    }

    const { tags, ...rest } = input;
    try {
      const card = await db.card.create({
        data: { ...rest, tags: tags || [], schedule: { create: {} } },
      });
      return { card, alreadySaved: false };
    } catch (e) {
      // DB dedup (Phase 21A): unique(deckId, cardType, question) — return the
      // existing card instead of inserting a duplicate.
      if (isUniqueViolation(e)) {
        const existing = await db.card.findFirst({
          where: { deckId: input.deckId, cardType: "vocab", question: input.question },
        });
        if (existing) return this.reviveOrExisting(existing.id, existing.deletedAt, { ...rest, tags: tags || [] });
      }
      throw e;
    }
  }

  /** A soft-deleted duplicate (Phase 28.2) is revived in place (clears the
   *  tombstone + refreshes content); a live duplicate is returned as-is. */
  private async reviveOrExisting(id: string, deletedAt: Date | null, data: Prisma.CardUpdateInput) {
    if (!deletedAt) {
      const existing = await db.card.findUnique({ where: { id } });
      return { card: existing!, alreadySaved: true };
    }
    const card = await db.card.update({ where: { id }, data: { ...data, deletedAt: null } });
    return { card, alreadySaved: false };
  }

  /** Questions (words) of all vocab cards the user has saved — powers the
   *  extension's vocab "Saved ✓" state. */
  async getSavedWords(userId: string): Promise<string[]> {
    const rows = await db.card.findMany({
      where: { cardType: "vocab", deck: { userId }, deletedAt: null },
      select: { question: true },
      distinct: ["question"],
    });
    return rows.map((r) => r.question).filter(Boolean);
  }

  /**
   * Saved vocab split by maturity for page word-status coloring (Phase 23).
   * "known" = mature (FSRS stability ≥ 21 days, the Anki mature convention),
   * "learning" = saved but not yet mature. Read-only; no FSRS/review change.
   */
  async getWordStatus(userId: string): Promise<{ known: string[]; learning: string[] }> {
    const rows = await db.card.findMany({
      where: { cardType: "vocab", deck: { userId }, deletedAt: null },
      select: { question: true, schedule: { select: { stability: true } } },
    });
    const known = new Set<string>();
    const learning = new Set<string>();
    for (const r of rows) {
      if (!r.question) continue;
      ((r.schedule?.stability ?? 0) >= 21 ? known : learning).add(r.question);
    }
    // A word counts as known if any of its cards is mature.
    for (const w of known) learning.delete(w);
    return { known: [...known], learning: [...learning] };
  }

  async getByDeck(deckId: string, userId: string) {
    const deck = await db.deck.findFirst({
      where: { id: deckId, userId },
    });

    if (!deck) {
      throw new AppError(404, "Deck not found", "DECK_NOT_FOUND");
    }

    return await db.card.findMany({ where: { deckId, deletedAt: null } });
  }

  async getById(cardId: string) {
    const card = await db.card.findFirst({ where: { id: cardId, deletedAt: null } });

    if (!card) {
      throw new AppError(404, "Card not found", "CARD_NOT_FOUND");
    }

    return card;
  }

  async update(cardId: string, input: UpdateCardInput) {
    await this.getById(cardId);
    return await db.card.update({
      where: { id: cardId },
      data: input,
    });
  }

  /**
   * Reset learning progress (Phase 52). Returns the card's schedule to a "new"
   * state (reps 0, stability 0, due now) WITHOUT touching the FSRS algorithm —
   * difficulty + lapse history are preserved. Uses the existing schedule path.
   */
  async resetSchedule(cardId: string) {
    await this.getById(cardId); // 404 / ownership-adjacent guard
    return db.cardSchedule.update({
      where: { cardId },
      data: { reps: 0, stability: 0, state: "new", dueDate: new Date(), lastReviewAt: null },
    });
  }

  /** Soft-delete (Phase 28.2): set the tombstone so the deletion propagates via
   *  sync. Media objects are NOT removed here — object cleanup is deferred to an
   *  async background purge while the row still references the URLs. */
  async delete(cardId: string) {
    await this.getById(cardId); // 404 if already deleted/missing
    await db.card.update({ where: { id: cardId }, data: { deletedAt: new Date() } });
  }

  /** Resolve the target deck: the provided id (must belong to the user) or,
   *  when omitted, the user's first deck — matching the extension save flow. */
  private async resolveDeck(userId: string, deckId?: string) {
    if (deckId) {
      const deck = await db.deck.findFirst({ where: { id: deckId, userId } });
      if (!deck) throw new AppError(404, "Deck not found", "DECK_NOT_FOUND");
      return deck;
    }
    const deck = await db.deck.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    if (!deck) throw new AppError(404, "No deck found", "DECK_NOT_FOUND");
    return deck;
  }

  /**
   * Create a grammar flashcard, mapping the detected pattern onto the shared
   * Card table (cardType "grammar"). Idempotent per (user, patternId): if the
   * pattern is already saved in any of the user's decks, the existing card is
   * returned with `alreadySaved: true` instead of inserting a duplicate.
   */
  async createGrammar(userId: string, input: CreateGrammarCardInput) {
    const deck = await this.resolveDeck(userId, input.deckId);

    try {
      const card = await db.card.create({
        data: {
          cardType: "grammar",
          deckId: deck.id,
          question: input.name,
          answer: input.explanation,
          grammarNotes: input.detail,
          jlptLevel: input.jlptLevel,
          patternId: input.patternId,
          examples: input.examples ?? [],
          sourceUrl: input.sourceUrl,
          sourceType: input.sourceUrl ? "web" : undefined,
          contextSentence: input.contextSentence,
          tags: ["grammar"],
          schedule: { create: {} },
        },
      });
      return { card, alreadySaved: false };
    } catch (e) {
      // DB dedup (Phase 21A): unique(deckId, cardType, patternId).
      if (isUniqueViolation(e)) {
        const existing = await db.card.findFirst({
          where: { deckId: deck.id, cardType: "grammar", patternId: input.patternId },
        });
        if (existing)
          return this.reviveOrExisting(existing.id, existing.deletedAt, {
            answer: input.explanation,
            grammarNotes: input.detail,
            jlptLevel: input.jlptLevel,
            examples: input.examples ?? [],
            sourceUrl: input.sourceUrl,
            contextSentence: input.contextSentence,
          });
      }
      throw e;
    }
  }

  /**
   * Create a sentence flashcard on the shared Card table (cardType "sentence").
   * Idempotent per (user, sentenceText): if the same sentence is already saved
   * in any of the user's decks, the existing card is returned with
   * `alreadySaved: true` instead of inserting a duplicate — mirroring the
   * vocabulary and grammar dedup.
   */
  async createSentence(userId: string, input: CreateSentenceCardInput) {
    const deck = await this.resolveDeck(userId, input.deckId);

    try {
      const card = await db.card.create({
        data: {
          cardType: "sentence",
          deckId: deck.id,
          question: input.sentenceText,
          answer: input.translation,
          reading: input.reading,
          examples: input.examples ?? [],
          sourceUrl: input.sourceUrl,
          sourceType: input.sourceUrl ? "web" : undefined,
          contextSentence: input.contextSentence,
          imageUrl: input.imageUrl,
          audioUrl: input.audioUrl,
          tags: ["sentence"],
          schedule: { create: {} },
        },
      });
      return { card, alreadySaved: false };
    } catch (e) {
      // DB dedup (Phase 21A): unique(deckId, cardType, question=sentenceText).
      if (isUniqueViolation(e)) {
        const existing = await db.card.findFirst({
          where: { deckId: deck.id, cardType: "sentence", question: input.sentenceText },
        });
        if (existing)
          return this.reviveOrExisting(existing.id, existing.deletedAt, {
            answer: input.translation,
            reading: input.reading,
            examples: input.examples ?? [],
            sourceUrl: input.sourceUrl,
            contextSentence: input.contextSentence,
            imageUrl: input.imageUrl,
            audioUrl: input.audioUrl,
          });
      }
      throw e;
    }
  }

  /**
   * Grammar Library (Phase 38). Bulk-load every grammar card the user has saved
   * with its FSRS schedule + last-review timestamp, in one query. Read-only;
   * reuses the shared card table and the "grammar" cardType — no schema change,
   * no FSRS/review change. Status/due derivation happens client-side.
   */
  async getGrammarLibrary(userId: string) {
    const rows = await db.card.findMany({
      where: { cardType: "grammar", deck: { userId }, deletedAt: null },
      select: {
        id: true,
        question: true, // pattern name
        answer: true, // meaning
        grammarNotes: true,
        jlptLevel: true,
        patternId: true,
        examples: true,
        createdAt: true,
        schedule: {
          select: { state: true, dueDate: true, stability: true, difficulty: true, reps: true, lapses: true },
        },
        reviewLogs: { select: { reviewedAt: true }, orderBy: { reviewedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      pattern: r.question,
      meaning: r.answer,
      detail: r.grammarNotes,
      jlptLevel: r.jlptLevel,
      patternId: r.patternId,
      examples: r.examples,
      createdAt: r.createdAt,
      schedule: r.schedule,
      lastReviewedAt: r.reviewLogs[0]?.reviewedAt ?? null,
    }));
  }

  /** patternIds of all grammar cards the user has saved — powers the
   *  extension's "Saved ✓" state without leaking full card rows. */
  async getSavedGrammarPatternIds(userId: string): Promise<string[]> {
    const rows = await db.card.findMany({
      where: { cardType: "grammar", deck: { userId }, patternId: { not: null }, deletedAt: null },
      select: { patternId: true },
      distinct: ["patternId"],
    });
    return rows.map((r) => r.patternId!).filter(Boolean);
  }
}
