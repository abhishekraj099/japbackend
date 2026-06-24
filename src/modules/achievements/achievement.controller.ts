import { Request, Response, NextFunction } from "express";
import { achievementService } from "./achievement.service.js";

export const getAchievements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await achievementService.getAchievements(req.user!.id));
  } catch (error) {
    next(error);
  }
};
