import { Request, Response, NextFunction } from "express";
import { ReviewService } from "./review.service.js";
import { SubmitReviewInput } from "./review.schema.js";

const reviewService = new ReviewService();

export const getReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviews = await reviewService.getReviewsForUser(req.user!.id);
    res.json(reviews);
  } catch (error) {
    next(error);
  }
};

export const getDueCards = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const cards = await reviewService.getDueCards(req.user!.id, limit);
    res.json(cards);
  } catch (error) {
    next(error);
  }
};

export const submitReview = async (
  req: Request<{}, {}, SubmitReviewInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const review = await reviewService.submitReview(req.user!.id, req.body);
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
};
