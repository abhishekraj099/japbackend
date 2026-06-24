import { db } from "../../config/database.js";
import { AppError } from "../../lib/errors/AppError.js";
import { CreateDeckInput, UpdateDeckInput } from "./deck.schema.js";

export class DeckService {
  async create(userId: string, input: CreateDeckInput) {
    return await db.deck.create({
      data: {
        ...input,
        userId,
      },
    });
  }

  async getAll(userId: string) {
    return await db.deck.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        language: true,
        // Count live cards only (Phase 28.2).
        _count: { select: { cards: { where: { deletedAt: null } } } },
        createdAt: true,
      },
    });
  }

  async getById(deckId: string, userId: string) {
    const deck = await db.deck.findFirst({
      where: { id: deckId, userId, deletedAt: null },
    });

    if (!deck) {
      throw new AppError(404, "Deck not found", "DECK_NOT_FOUND");
    }

    return deck;
  }

  async update(deckId: string, userId: string, input: UpdateDeckInput) {
    const deck = await this.getById(deckId, userId);
    return await db.deck.update({
      where: { id: deck.id },
      data: input,
    });
  }

  /** Soft-delete the deck and cascade-tombstone its live cards (Phase 28.2), so
   *  both the deck and its cards propagate as deletions via sync. */
  async delete(deckId: string, userId: string) {
    const deck = await this.getById(deckId, userId);
    const now = new Date();
    await db.$transaction([
      db.card.updateMany({ where: { deckId: deck.id, deletedAt: null }, data: { deletedAt: now } }),
      db.deck.update({ where: { id: deck.id }, data: { deletedAt: now } }),
    ]);
  }
}
