import { db } from "../../config/database.js";

/**
 * Sync foundation (Phase 21C → 28.2). Returns entities changed since a
 * timestamp so the Android/web client can pull deltas.
 *
 * Phase 28.2 — deletions are first-class: soft-deleted rows are excluded from
 * the upsert arrays and surfaced as tombstone id lists (split by cardType) so
 * offline clients remove the local record, its schedule, and cached media.
 * Delete wins over edit: a tombstoned card appears only in the deleted* lists.
 */
export class SyncService {
  async getChanges(userId: string, since: Date) {
    const [decks, cards, schedules, deletedDecks, deletedCards] = await Promise.all([
      // Upserts: live rows changed since the cursor.
      db.deck.findMany({ where: { userId, deletedAt: null, updatedAt: { gt: since } } }),
      db.card.findMany({ where: { deck: { userId }, deletedAt: null, updatedAt: { gt: since } } }),
      db.cardSchedule.findMany({
        where: { card: { deck: { userId }, deletedAt: null }, updatedAt: { gt: since } },
      }),
      // Tombstones: rows deleted since the cursor.
      db.deck.findMany({
        where: { userId, deletedAt: { gt: since } },
        select: { id: true },
      }),
      db.card.findMany({
        where: { deck: { userId }, deletedAt: { gt: since } },
        select: { id: true, cardType: true },
      }),
    ]);

    const deletedByType = (type: string) =>
      deletedCards.filter((c) => c.cardType === type).map((c) => c.id);

    return {
      serverTime: new Date().toISOString(),
      since: since.toISOString(),
      decks,
      cards,
      schedules,
      deletedDeckIds: deletedDecks.map((d) => d.id),
      deletedCardIds: deletedByType("vocab"),
      deletedGrammarIds: deletedByType("grammar"),
      deletedSentenceIds: deletedByType("sentence"),
      // Pagination reserved (Phase 28.2 design): single page for now.
      nextCursor: null as string | null,
    };
  }
}
