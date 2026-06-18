import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors/AppError.js";
import logger from "../config/logger.js";

export const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, { code: err.code, statusCode: err.statusCode });
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  logger.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
  });
};
