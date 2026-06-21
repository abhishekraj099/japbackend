import { Request, Response, NextFunction } from "express";
import { IntegrationService } from "./integration.service.js";

const integrationService = new IntegrationService();

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const integrations = await integrationService.getAll(req.user!.id);
    res.json(integrations);
  } catch (error) {
    next(error);
  }
};

export const connectAnki = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const integration = await integrationService.connect(req.user!.id, "anki");
    res.status(200).json(integration);
  } catch (error) {
    next(error);
  }
};

export const disconnectAnki = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const integration = await integrationService.disconnect(req.user!.id, "anki");
    res.status(200).json(integration);
  } catch (error) {
    next(error);
  }
};
