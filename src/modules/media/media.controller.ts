import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as mediaService from "./media.service.js";

const uploadSchema = z.object({
  kind: z.enum(["image", "audio"]),
  dataUrl: z.string().min(1),
});

export const upload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!mediaService.mediaConfigured()) {
      // Not configured → client keeps inlining data URLs (legacy path).
      return res.status(503).json({ error: "Media storage not configured" });
    }
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid upload payload" });
    const url = await mediaService.upload(req.user!.id, parsed.data.kind, parsed.data.dataUrl);
    res.status(201).json({ url });
  } catch (error) {
    if (error instanceof mediaService.ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};
