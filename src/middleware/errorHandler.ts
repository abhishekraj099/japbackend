import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors/AppError.js";
import logger from "../config/logger.js";

/**
 * Version-aware error formatter (Phase 28.3).
 *
 * v1 (`/api/v1/*`) uses the standardized envelope:
 *   { "error": { "code", "message", "details"? } }
 * Legacy (`/api/*`) keeps the historical shape `{ "error": <string>, "code"? }`
 * so existing web/extension clients (which read `error` as a string) don't break.
 */
const isV1 = (req: Request) =>
  req.originalUrl.startsWith("/api/v1/") || req.originalUrl === "/api/v1";

const send = (
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
) => {
  if (isV1(req)) {
    return res.status(status).json({
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    });
  }
  return res.status(status).json({ error: message, code });
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, { code: err.code, statusCode: err.statusCode });
    return send(req, res, err.statusCode, err.code ?? "ERROR", err.message, err.details);
  }

  logger.error("Unhandled error:", err);
  return send(req, res, 500, "INTERNAL_ERROR", "Internal server error");
};
