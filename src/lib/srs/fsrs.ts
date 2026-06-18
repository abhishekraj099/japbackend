import { ScheduleState, ScheduleUpdate } from "./srs.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/**
 * SM-2 derived scheduler mapped onto the CardSchedule model.
 * - `difficulty` is kept on a 1-10 scale (higher = harder, default 5)
 * - `stability` is used as the current interval, in days
 * - ratings below 3 are treated as a lapse (relearning)
 */
export const calculateNextReview = (
  state: ScheduleState,
  rating: number
): ScheduleUpdate => {
  const now = new Date();

  if (rating < 3) {
    return {
      dueDate: new Date(now.getTime() + DAY_MS),
      lastReviewAt: now,
      stability: 1,
      difficulty: clamp(state.difficulty + 1, 1, 10),
      reps: 0,
      lapses: state.lapses + 1,
      state: "relearning",
    };
  }

  const newDifficulty = clamp(state.difficulty - (rating - 3) * 0.5, 1, 10);
  const factor = clamp(2.5 - (newDifficulty - 5) * 0.15, 1.3, 2.5);

  let intervalDays: number;
  if (state.reps === 0) {
    intervalDays = 1;
  } else if (state.reps === 1) {
    intervalDays = 3;
  } else {
    intervalDays = Math.max(1, Math.round(Math.max(1, state.stability) * factor));
  }

  const reps = state.reps + 1;

  return {
    dueDate: new Date(now.getTime() + intervalDays * DAY_MS),
    lastReviewAt: now,
    stability: intervalDays,
    difficulty: newDifficulty,
    reps,
    lapses: state.lapses,
    state: reps >= 2 ? "review" : "learning",
  };
};
