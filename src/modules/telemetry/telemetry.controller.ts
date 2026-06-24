import { Request, Response, NextFunction } from "express";
import { telemetryService } from "./telemetry.service.js";
import { telemetryIngestSchema } from "./telemetry.types.js";

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
