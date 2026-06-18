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
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        language: true,
        _count: { select: { cards: true } },
        createdAt: true,
      },
    });
  }

  async getById(deckId: string, userId: string) {
    const deck = await db.deck.findFirst({
      where: { id: deckId, userId },
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

  async delete(deckId: string, userId: string) {
    const deck = await this.getById(deckId, userId);
    await db.deck.delete({ where: { id: deck.id } });
  }
}
