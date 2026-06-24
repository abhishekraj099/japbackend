import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service.js";
import { RegisterInput, LoginInput } from "./auth.schema.js";
import { AppError } from "../../lib/errors/AppError.js";

const authService = new AuthService();
const ua = (req: Request) => req.headers["user-agent"]?.slice(0, 255);

export const register = async (req: Request<{}, {}, RegisterInput>, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await authService.register(req.body, ua(req)));
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request<{}, {}, LoginInput>, res: Response, next: NextFunction) => {
  try {
    res.json(await authService.login(req.body, ua(req)));
  } catch (error) {
    next(error);
  }
};

export const refresh = async (
  req: Request<{}, {}, { refreshToken?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const rt = req.body?.refreshToken;
    if (!rt) throw new AppError(400, "refreshToken required", "REFRESH_REQUIRED");
    res.json(await authService.refresh(rt, ua(req)));
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request<{}, {}, { refreshToken?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.body?.refreshToken) await authService.logout(req.body.refreshToken);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const logoutAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logoutAll(req.user!.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
