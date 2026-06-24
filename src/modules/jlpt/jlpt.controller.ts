import { Request, Response, NextFunction } from "express";
import { jlptService } from "./jlpt.service.js";

export const getOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await jlptService.getOverview(req.user!.id));
  } catch (error) {
    next(error);
  }
};
