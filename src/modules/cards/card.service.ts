import { db } from "../../config/database.js";
import { AppError } from "../../lib/errors/AppError.js";
import {
  CreateCardInput,
  UpdateCardInput,
  CreateGrammarCardInput,
} from "./card.schema.js";

export class CardService {
  async create(userId: string, input: CreateCardInput) {
    const deck = await db.deck.findFirst({
      where: { id: input.deckId, userId },
    });

    if (!deck) {
      throw new AppError(404, "Deck not found", "DECK_NOT_FOUND");
    }

    const { tags, ...rest } = input;
    return await db.card.create({
      data: {
        ...rest,
        tags: tags || [],
        schedule: {
          create: {},
        },
      },
    });
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

    const existing = await db.card.findFirst({
      where: {
        cardType: "grammar",
        patternId: input.patternId,
        deck: { userId },
      },
    });
    if (existing) return { card: existing, alreadySaved: true };

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
