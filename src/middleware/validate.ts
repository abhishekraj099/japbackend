import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../lib/errors/AppError.js";

export const validate = (schema: ZodSchema, source: "body" | "query" | "params" = "body") => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = source === "body" ? req.body : source === "query" ? req.query : req.params;
      const validated = schema.parse(data);

      if (source === "body") req.body = validated;
      else if (source === "query") req.query = validated;
      else req.params = validated;

      next();
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  };
};
