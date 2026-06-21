import { db } from "../../config/database.js";

/**
 * Sync foundation (Phase 21C). Returns entities changed since a timestamp so a
 * future Android client can pull deltas. Upserts only — deletions are not yet
 * captured (needs soft-delete tombstones, see the Phase 19 audit).
 */
export class SyncService {
  async getChanges(userId: string, since: Date) {
    const [decks, cards, schedules] = await Promise.all([
      db.deck.findMany({ where: { userId, updatedAt: { gt: since } } }),
      db.card.findMany({ where: { deck: { userId }, updatedAt: { gt: since } } }),
      db.cardSchedule.findMany({
        where: { card: { deck: { userId } }, updatedAt: { gt: since } },
      }),
    ]);
    return {
      serverTime: new Date().toISOString(),
      since: since.toISOString(),
      decks,
      cards,
      schedules,
    };
  }
}
