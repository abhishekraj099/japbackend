import { Request, Response, NextFunction } from "express";
import { telemetryService } from "./telemetry.service.js";
import { telemetryIngestSchema, healthIngestSchema } from "./telemetry.types.js";
import { AppError } from "../../lib/errors/AppError.js";

export const ingest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = telemetryIngestSchema.safeParse(req.body);
    if (!parsed.success) {
      // Telemetry is best-effort — never error the client; just drop bad data.
      return res.status(202).json({ accepted: 0 });
    }
    await telemetryService.ingest(parsed.data);
    res.status(202).json({ accepted: parsed.data.events.length });
  } catch (error) {
    next(error);
  }
};

export const metrics = async (
  req: Request<{}, {}, {}, { days?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days ?? "7", 10) || 7, 1), 90);
    res.json(await telemetryService.metrics(days));
  } catch (error) {
    next(error);
  }
};

// ── Synthetic provider health checks (Phase 25I.3) ───────────────────────────
export const recordHealth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = healthIngestSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "Invalid health payload", "VALIDATION_ERROR", parsed.error.issues);
    await telemetryService.recordHealth(parsed.data);
    res.status(201).json({ recorded: parsed.data.results.length });
  } catch (error) {
    next(error);
  }
};

export const healthMetrics = async (
  req: Request<{}, {}, {}, { days?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days ?? "14", 10) || 14, 1), 90);
    res.json(await telemetryService.healthMetrics(days));
  } catch (error) {
    next(error);
  }
};
