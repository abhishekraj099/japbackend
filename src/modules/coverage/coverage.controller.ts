import { Request, Response, NextFunction } from "express";
import { coverageService } from "./coverage.service.js";

export const getCoverage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await coverageService.getCoverage(req.user!.id));
  } catch (error) {
    next(error);
  }
};
