import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors/AppError.js";

export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      throw new AppError(401, "No token provided", "NO_TOKEN");
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      email: string;
      iat: number;
      exp: number;
    };

    req.user = decoded;
    next();
  } catch (error) {
    // Route through the central handler for a version-consistent shape.
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError(401, "Invalid token", "INVALID_TOKEN"));
    }
    next(error);
  }
};
