import { db } from "../../config/database.js";

/**
 * Incremental sync with cursor pagination (Phase 21C → 28.2 → 28.4).
 *
 * A sync sweep pulls live upserts (decks → cards → schedules) plus deletion
 * tombstones, changed within a FROZEN window `(since, serverTime]`. The window
 * bounds (`since`, `serverTime`) are pinned on the first page and carried in the
 * opaque cursor, so concurrent writes during pagination never cause skipped or
 * duplicated records.
 *
 * Pagination is keyset (not offset): each phase is ordered by (updatedAt, id)
 * ascending and the cursor records the last (updatedAt, id) emitted. This is
 * deterministic, dup-free, and idempotent — re-requesting the same cursor
 * returns the same page, so an interrupted/app-killed client resumes exactly.
 *
 * Tombstones (id-only, cheap) are returned on the first page of a sweep.
 */

type Phase = "decks" | "cards" | "schedules";
const PHASES: Phase[] = ["decks", "cards", "schedules"];

interface CursorState {
  s: number; // sinceMs (window lower bound, exclusive)
  t: number; // serverTimeMs (window upper bound, inclusive) — frozen for the sweep
  p: Phase; // phase to resume
  au: number | null; // keyset: last updatedAt (ms)
  ai: string | null; // keyset: last id
}

const encodeCursor = (c: CursorState): string =>
  Buffer.from(JSON.stringify(c)).toString("base64url");
const decodeCursor = (raw: string): CursorState | null => {
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString()) as CursorState;
    if (typeof c.s !== "number" || typeof c.t !== "number" || !PHASES.includes(c.p)) return null;
    return c;
  } catch {
    return null;
  }
};

export interface SyncParams {
  since: Date;
  cursor?: string;
  limit: number;
}

export class SyncService {
  private fetchPhase(
    phase: Phase,
    userId: string,
    sinceDate: Date,
    serverTime: Date,
    after: { updatedAt: Date; id: string } | null,
    take: number
  ) {
    const window = { updatedAt: { gt: sinceDate, lte: serverTime } };
    const keyset = after
      ? { OR: [{ updatedAt: { gt: after.updatedAt } }, { updatedAt: after.updatedAt, id: { gt: after.id } }] }
      : {};
    const orderBy = [{ updatedAt: "asc" as const }, { id: "asc" as const }];

    if (phase === "decks") {
      return db.deck.findMany({ where: { AND: [{ userId, deletedAt: null }, window, keyset] }, orderBy, take });
    }
    if (phase === "cards") {
      return db.card.findMany({ where: { AND: [{ deck: { userId }, deletedAt: null }, window, keyset] }, orderBy, take });
    }
    return db.cardSchedule.findMany({
      where: { AND: [{ card: { deck: { userId }, deletedAt: null } }, window, keyset] },
      orderBy,
      take,
    });
  }

  async getChanges(userId: string, params: SyncParams) {
    const { limit } = params;
    const dec = params.cursor ? decodeCursor(params.cursor) : null;

    const sinceMs = dec ? dec.s : params.since.getTime();
    const serverTimeMs = dec ? dec.t : Date.now();
    const startPhase: Phase = dec ? dec.p : "decks";
    const startAfter = dec && dec.au != null && dec.ai != null ? { updatedAt: new Date(dec.au), id: dec.ai } : null;

    const sinceDate = new Date(sinceMs);
    const serverTime = new Date(serverTimeMs);

    const result = {
      serverTime: serverTime.toISOString(),
      since: sinceDate.toISOString(),
      decks: [] as unknown[],
      cards: [] as unknown[],
      schedules: [] as unknown[],
      deletedDeckIds: [] as string[],
      deletedCardIds: [] as string[],
      deletedGrammarIds: [] as string[],
      deletedSentenceIds: [] as string[],
      nextCursor: null as string | null,
    };

    // Tombstones: first page of a sweep only (cheap id lists; applied once).
    if (!dec) {
      const tWindow = { deletedAt: { gt: sinceDate, lte: serverTime } };
      const [deletedDecks, deletedCards] = await Promise.all([
        db.deck.findMany({ where: { userId, ...tWindow }, select: { id: true } }),
        db.card.findMany({ where: { deck: { userId }, ...tWindow }, select: { id: true, cardType: true } }),
      ]);
      result.deletedDeckIds = deletedDecks.map((d) => d.id);
      result.deletedCardIds = deletedCards.filter((c) => c.cardType === "vocab").map((c) => c.id);
      result.deletedGrammarIds = deletedCards.filter((c) => c.cardType === "grammar").map((c) => c.id);
      result.deletedSentenceIds = deletedCards.filter((c) => c.cardType === "sentence").map((c) => c.id);
    }

    // Walk phases from the cursor's phase, skipping empty phases in-request so a
    // page is never needlessly empty (except the final page).
    const startIdx = PHASES.indexOf(startPhase);
    for (let i = startIdx; i < PHASES.length; i++) {
      const phase = PHASES[i];
      const after = i === startIdx ? startAfter : null;
      const rows = (await this.fetchPhase(phase, userId, sinceDate, serverTime, after, limit + 1)) as Array<{
        id: string;
        updatedAt: Date;
      }>;
      if (rows.length === 0) continue;

      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      result[phase] = rows;
      const last = rows[rows.length - 1];

      if (hasMore) {
        result.nextCursor = encodeCursor({ s: sinceMs, t: serverTimeMs, p: phase, au: last.updatedAt.getTime(), ai: last.id });
      } else if (i + 1 < PHASES.length) {
        result.nextCursor = encodeCursor({ s: sinceMs, t: serverTimeMs, p: PHASES[i + 1], au: null, ai: null });
      } else {
        result.nextCursor = null; // sweep complete
      }
      return result;
    }

    // All phases from the cursor were empty → sweep complete.
    result.nextCursor = null;
    return result;
  }
}
