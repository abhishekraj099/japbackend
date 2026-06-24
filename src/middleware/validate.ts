import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";
import { AppError } from "../lib/errors/AppError.js";

export const validate = (schema: ZodSchema, source: "body" | "query" | "params" = "body") => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = source === "body" ? req.body : source === "query" ? req.query : req.params;
      const validated = schema.parse(data);

      if (source === "body") req.body = validated;
      else if (source === "query") req.query = validated;
      else req.params = validated;

      next();
    } catch (error) {
      // Route through the central handler so the shape is version-consistent
      // (Phase 28.3). Legacy clients still get `error` as a readable string.
      if (error instanceof ZodError) {
        return next(new AppError(400, "Validation failed", "VALIDATION_ERROR", error.issues));
      }
      if (error instanceof Error) {
        return next(new AppError(400, error.message, "VALIDATION_ERROR"));
      }
      next(error);
    }
  };
};
