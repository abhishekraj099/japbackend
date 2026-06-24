import { Request, Response, NextFunction } from "express";
import { CardService } from "./card.service.js";
import {
  CreateCardInput,
  UpdateCardInput,
  CreateGrammarCardInput,
  CreateSentenceCardInput,
} from "./card.schema.js";

const cardService = new CardService();

export const createGrammar = async (
  req: Request<{}, {}, CreateGrammarCardInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { card, alreadySaved } = await cardService.createGrammar(
      req.user!.id,
      req.body
    );
    res.status(alreadySaved ? 200 : 201).json({ card, alreadySaved });
  } catch (error) {
    next(error);
  }
};

export const getSavedGrammar = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const patternIds = await cardService.getSavedGrammarPatternIds(req.user!.id);
    res.json({ patternIds });
  } catch (error) {
    next(error);
  }
};

/** Grammar Library bulk load (Phase 38). */
export const getGrammarLibrary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ items: await cardService.getGrammarLibrary(req.user!.id) });
  } catch (error) {
    next(error);
  }
};

export const createSentence = async (
  req: Request<{}, {}, CreateSentenceCardInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { card, alreadySaved } = await cardService.createSentence(
      req.user!.id,
      req.body
    );
    res.status(alreadySaved ? 200 : 201).json({ card, alreadySaved });
  } catch (error) {
    next(error);
  }
};

export const create = async (
  req: Request<{}, {}, CreateCardInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { card, alreadySaved } = await cardService.create(
      req.user!.id,
      req.body
    );
    // Keep the card fields at the top level (existing clients read the card
    // directly); add `alreadySaved` for dedup-aware callers.
    res.status(alreadySaved ? 200 : 201).json({ ...card, alreadySaved });
  } catch (error) {
    next(error);
  }
};

export const getSavedWords = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const words = await cardService.getSavedWords(req.user!.id);
    res.json({ words });
  } catch (error) {
    next(error);
  }
};

export const getWordStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const status = await cardService.getWordStatus(req.user!.id);
    res.json(status);
  } catch (error) {
    next(error);
  }
};

export const getByDeck = async (
  req: Request<{ deckId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const cards = await cardService.getByDeck(req.params.deckId, req.user!.id);
    res.json(cards);
  } catch (error) {
    next(error);
  }
};

export const getById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const card = await cardService.getById(req.params.id);
    res.json(card);
  } catch (error) {
    next(error);
  }
};

export const update = async (
  req: Request<{ id: string }, {}, UpdateCardInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const updated = await cardService.update(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const remove = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    await cardService.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

/** Reset a card's learning progress (Phase 52). */
export const reset = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    res.json(await cardService.resetSchedule(req.params.id));
  } catch (error) {
    next(error);
  }
};
