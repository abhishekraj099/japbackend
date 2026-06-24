import { Request, Response, NextFunction } from "express";
import { roadmapService } from "./roadmap.service.js";

export const getRoadmap = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await roadmapService.getRoadmap(req.user!.id));
  } catch (error) {
    next(error);
  }
};
