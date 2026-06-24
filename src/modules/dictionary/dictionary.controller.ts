import { Request, Response, NextFunction } from "express";
import { DictionaryService } from "./dictionary.service.js";
import { aiLookup, aiSentence, aiLookupAvailable } from "./dictionary.ai.js";

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

/**
 * AI fallback lookup (Phase 18A). Returns a single AI-generated result, 404
 * when nothing usable was produced, or 503 when AI is not configured.
 */
export const aiSearch = async (
  req: Request<{}, {}, {}, { q?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!aiLookupAvailable()) {
      return res.status(503).json({ error: "AI lookup not configured" });
    }
    const q = req.query.q ?? "";
    const out = await aiLookup(q, req.user!.id); // authenticated route → req.user set
    if (out.quotaExceeded) {
      return res.status(429).json({ error: "AI quota exceeded", remainingQuota: 0 });
    }
    if (!out.result) return res.status(404).json({ error: "No result", remainingQuota: out.remainingQuota });
    res.json({
      ...out.result,
      source: out.source,
      provider: out.provider ?? "gemini",
      remainingQuota: out.remainingQuota,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * AI sentence reading + translation (Phase 18D fallback). Returns
 * { reading, translation }; 404 when none, 503 when AI is not configured.
 */
export const aiSentenceSearch = async (
  req: Request<{}, {}, {}, { q?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!aiLookupAvailable()) {
      return res.status(503).json({ error: "AI lookup not configured" });
    }
    const out = await aiSentence(req.query.q ?? "", req.user!.id);
    if (out.quotaExceeded) {
      return res.status(429).json({ error: "AI quota exceeded", remainingQuota: 0 });
    }
    if (!out.ok) return res.status(404).json({ error: "No result", remainingQuota: out.remainingQuota });
    res.json({
      reading: out.reading,
      translation: out.translation,
      source: out.source,
      provider: out.provider ?? "gemini",
      remainingQuota: out.remainingQuota,
    });
  } catch (error) {
    next(error);
  }
};
