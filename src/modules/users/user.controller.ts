import { Request, Response, NextFunction } from "express";
import { UserService } from "./user.service.js";
import { UpdateUserInput } from "./user.schema.js";

const userService = new UserService();

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await userService.getProfile(req.user!.id);
    res.json(profile);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: Request<{}, {}, UpdateUserInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const updated = await userService.updateProfile(req.user!.id, req.body);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userService.deleteAccount(req.user!.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
