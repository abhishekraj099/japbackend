import { Request, Response, NextFunction } from "express";
import { SyncService } from "./sync.service.js";

const syncService = new SyncService();

/** Parse `since` as epoch milliseconds or an ISO string; default to epoch 0. */
function parseSince(raw?: string): Date {
  if (!raw || !raw.trim()) return new Date(0);
  const n = Number(raw);
  const d = Number.isFinite(n) ? new Date(n) : new Date(raw);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

export const getChanges = async (
  req: Request<{}, {}, {}, { since?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const since = parseSince(req.query.since);
    const result = await syncService.getChanges(req.user!.id, since);
    res.json(result);
  } catch (error) {
    next(error);
  }
};
