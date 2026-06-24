import { Request, Response, NextFunction } from "express";
import { grammarMasteryService } from "./grammar-mastery.service.js";

export const getMastery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await grammarMasteryService.getMastery(req.user!.id));
  } catch (error) {
    next(error);
  }
};
