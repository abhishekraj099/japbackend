import { Request, Response, NextFunction } from "express";
import { plannerService } from "./planner.service.js";

export const getToday = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await plannerService.getToday(req.user!.id));
  } catch (error) {
    next(error);
  }
};
