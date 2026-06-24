import { Request, Response, NextFunction } from "express";
import { SyncService } from "./sync.service.js";
import logger from "../../config/logger.js";

const syncService = new SyncService();

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

/** Parse `since` as epoch milliseconds or an ISO string; default to epoch 0. */
function parseSince(raw?: string): Date {
  if (!raw || !raw.trim()) return new Date(0);
  const n = Number(raw);
  const d = Number.isFinite(n) ? new Date(n) : new Date(raw);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function parseLimit(raw?: string): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export const getChanges = async (
  req: Request<{}, {}, {}, { since?: string; cursor?: string; limit?: string }>,
  res: Response,
  next: NextFunction
) => {
  const startedAt = Date.now();
  try {
    const since = parseSince(req.query.since);
    const limit = parseLimit(req.query.limit);
    const result = await syncService.getChanges(req.user!.id, { since, cursor: req.query.cursor, limit });

    const body = JSON.stringify(result);
    // Sync telemetry (Phase 28.4): per-page duration + payload size + counts.
    // Page count is the client's cumulative sweep length; the server logs each
    // page (hasNext) so it can be aggregated downstream.
    logger.info("sync.page", {
      userId: req.user!.id,
      durationMs: Date.now() - startedAt,
      bytes: Buffer.byteLength(body),
      limit,
      paged: !!req.query.cursor,
      counts: { decks: result.decks.length, cards: result.cards.length, schedules: result.schedules.length },
      hasNext: !!result.nextCursor,
    });

    res.type("application/json").send(body);
  } catch (error) {
    next(error);
  }
};
