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
        if (existing) return { card: existing, alreadySaved: true };
      }
      throw e;
    }
  }

  /** Questions (words) of all vocab cards the user has saved — powers the
   *  extension's vocab "Saved ✓" state. */
  async getSavedWords(userId: string): Promise<string[]> {
    const rows = await db.card.findMany({
      where: { cardType: "vocab", deck: { userId } },
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
      where: { cardType: "vocab", deck: { userId } },
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

    return await db.card.findMany({ where: { deckId } });
  }

  async getById(cardId: string) {
    const card = await db.card.findUnique({ where: { id: cardId } });

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

  async delete(cardId: string) {
    await this.getById(cardId);
    await db.card.delete({ where: { id: cardId } });
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
        if (existing) return { card: existing, alreadySaved: true };
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
        if (existing) return { card: existing, alreadySaved: true };
      }
      throw e;
    }
  }

  /** patternIds of all grammar cards the user has saved — powers the
   *  extension's "Saved ✓" state without leaking full card rows. */
  async getSavedGrammarPatternIds(userId: string): Promise<string[]> {
    const rows = await db.card.findMany({
      where: { cardType: "grammar", deck: { userId }, patternId: { not: null } },
      select: { patternId: true },
      distinct: ["patternId"],
    });
    return rows.map((r) => r.patternId!).filter(Boolean);
  }
}
