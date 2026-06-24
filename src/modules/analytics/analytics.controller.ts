import { Request, Response, NextFunction } from "express";
import { analyticsService } from "./analytics.service.js";

export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.getDashboard(req.user!.id));
  } catch (error) {
    next(error);
  }
};
