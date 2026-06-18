import { Request, Response, NextFunction } from "express";
import { CardService } from "./card.service.js";
import { CreateCardInput, UpdateCardInput } from "./card.schema.js";

const cardService = new CardService();

export const create = async (
  req: Request<{}, {}, CreateCardInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const card = await cardService.create(req.user!.id, req.body);
    res.status(201).json(card);
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
