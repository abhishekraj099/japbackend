import { Request, Response, NextFunction } from "express";
import { DeckService } from "./deck.service.js";
import { CreateDeckInput, UpdateDeckInput } from "./deck.schema.js";

const deckService = new DeckService();

export const create = async (
  req: Request<{}, {}, CreateDeckInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const deck = await deckService.create(req.user!.id, req.body);
    res.status(201).json(deck);
  } catch (error) {
    next(error);
  }
};

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decks = await deckService.getAll(req.user!.id);
    res.json(decks);
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
    const deck = await deckService.getById(req.params.id, req.user!.id);
    res.json(deck);
  } catch (error) {
    next(error);
  }
};

export const update = async (
  req: Request<{ id: string }, {}, UpdateDeckInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const updated = await deckService.update(req.params.id, req.user!.id, req.body);
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
    await deckService.delete(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
