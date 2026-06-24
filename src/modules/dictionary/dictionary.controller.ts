import { Request, Response, NextFunction } from "express";
import { DictionaryService } from "./dictionary.service.js";
import { aiLookup, aiSentence, aiLookupAvailable } from "./dictionary.ai.js";
import { aiService } from "../ai/ai.service.js";
import { AppError } from "../../lib/errors/AppError.js";
import type { GrammarQuestionType } from "../ai/ai.types.js";

const dictionaryService = new DictionaryService();
const GRAMMAR_TYPES: GrammarQuestionType[] = ["explain", "compare", "breakdown"];

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

/**
 * AI Grammar Assistant (Phase 36). POST { questionType, pattern?, text }.
 * Cached + quota-enforced via the shared AI layer. Structured JSON response.
 */
export const grammarAssistant = async (
  req: Request<{}, {}, { questionType?: string; pattern?: string; text?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!aiLookupAvailable()) throw new AppError(503, "AI not configured", "AI_NOT_CONFIGURED");
    const questionType = req.body?.questionType as GrammarQuestionType;
    const text = (req.body?.text ?? "").trim();
    if (!GRAMMAR_TYPES.includes(questionType) || !text) {
      throw new AppError(400, "questionType and text are required", "VALIDATION_ERROR");
    }
    const out = await aiService.grammarAssistant(
      { questionType, pattern: req.body?.pattern ?? null, text },
      req.user!.id
    );
    if (out.quotaExceeded) throw new AppError(429, "AI quota exceeded", "AI_QUOTA_EXCEEDED");
    if (!out.result) throw new AppError(404, "No result", "NO_RESULT");
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
