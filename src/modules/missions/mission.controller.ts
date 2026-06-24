import { Request, Response, NextFunction } from "express";
import { missionService } from "./mission.service.js";

export const getToday = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await missionService.getToday(req.user!.id));
  } catch (error) {
    next(error);
  }
};
