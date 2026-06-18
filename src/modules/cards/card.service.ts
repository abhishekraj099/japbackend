import { db } from "../../config/database.js";
import { AppError } from "../../lib/errors/AppError.js";
import { CreateCardInput, UpdateCardInput } from "./card.schema.js";

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
}
