import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as mediaService from "./media.service.js";
import { AppError } from "../../lib/errors/AppError.js";

const uploadSchema = z.object({
  kind: z.enum(["image", "audio"]),
  dataUrl: z.string().min(1),
});

export const upload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!mediaService.mediaConfigured()) {
      // Not configured → client keeps inlining data URLs (legacy path).
      throw new AppError(503, "Media storage not configured", "MEDIA_NOT_CONFIGURED");
    }
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "Invalid upload payload", "VALIDATION_ERROR", parsed.error.issues);
    const url = await mediaService.upload(req.user!.id, parsed.data.kind, parsed.data.dataUrl);
    res.status(201).json({ url });
  } catch (error) {
    if (error instanceof mediaService.ValidationError) {
      return next(new AppError(400, error.message, "MEDIA_VALIDATION"));
    }
    next(error);
  }
};
