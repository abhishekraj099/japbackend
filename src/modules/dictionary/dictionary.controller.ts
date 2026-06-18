import { Request, Response, NextFunction } from "express";
import { DictionaryService } from "./dictionary.service.js";

const dictionaryService = new DictionaryService();

export const search = async (
  req: Request<{}, {}, {}, { q?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const q = req.query.q ?? "";
    const results = await dictionaryService.search(q);
    res.json(results);
  } catch (error) {
    next(error);
  }
};
