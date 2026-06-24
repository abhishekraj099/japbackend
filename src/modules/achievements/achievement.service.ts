import { db } from "../../config/database.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { coverageService } from "../coverage/coverage.service.js";

/**
 * Achievement System (Phase 42). Purely DERIVED milestones — no achievement
 * table, no persistence, no writes, no FSRS/review/analytics changes. Unlock =
 * (live metric ≥ target). Reuses the analytics + coverage aggregations plus one
 * grammar count; nothing heavy is recomputed.
 */

export type AchievementCategory = "Review" | "Vocabulary" | "Grammar" | "Streak" | "Coverage" | "Mastery";
type MetricKey = "reviews" | "vocab" | "grammar" | "streak" | "coverageAnime" | "mastery";

export interface Achievement {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  unlocked: boolean;
  progress: number;
  target: number;
}

interface Tier {
  category: AchievementCategory;
  metric: MetricKey;
  target: number;
  title: string;
  description: string;
}

const TIERS: Tier[] = [
  ...[100, 500, 1000, 5000].map((t) => ({ category: "Review" as const, metric: "reviews" as const, target: t, title: `Review ${t} cards`, description: `Complete ${t} total reviews.` })),
  ...[100, 500, 1000, 5000].map((t) => ({ category: "Vocabulary" as const, metric: "vocab" as const, target: t, title: `Save ${t} words`, description: `Save ${t} vocabulary cards.` })),
  ...[25, 50, 100, 250].map((t) => ({ category: "Grammar" as const, metric: "grammar" as const, target: t, title: `Save ${t} grammar cards`, description: `Build a ${t}-pattern grammar library.` })),
  ...[3, 7, 30, 100].map((t) => ({ category: "Streak" as const, metric: "streak" as const, target: t, title: `${t}-day streak`, description: `Review on ${t} consecutive days.` })),
  ...[50, 70, 85, 95].map((t) => ({ category: "Coverage" as const, metric: "coverageAnime" as const, target: t, title: `${t}% Anime Coverage`, description: `Reach ${t}% estimated anime coverage.` })),
  ...[100, 500, 1000].map((t) => ({ category: "Mastery" as const, metric: "mastery" as const, target: t, title: `${t} known words`, description: `Master ${t} words (FSRS stability ≥ 21d).` })),
];

export class AchievementService {
  async getAchievements(userId: string) {
    const [overview, reviewStats, streaks, coverage, grammar] = await Promise.all([
      analyticsService.getOverview(userId),
      analyticsService.getReviewStats(userId),
      analyticsService.getStreaks(userId),
      coverageService.getCoverage(userId),
      db.card.count({ where: { cardType: "grammar", deck: { userId }, deletedAt: null } }),
    ]);

    const metrics: Record<MetricKey, number> = {
      reviews: reviewStats.totalReviews,
      vocab: overview.totalSavedWords,
      grammar,
      streak: streaks.longestStreak,
      coverageAnime: coverage.categories.find((c) => c.id === "anime")?.coveragePercent ?? 0,
      mastery: overview.knownWords,
    };

    const achievements: Achievement[] = TIERS.map((t) => {
      const value = metrics[t.metric];
      return {
        id: `${t.category.toLowerCase()}-${t.target}`,
        category: t.category,
        title: t.title,
        description: t.description,
        unlocked: value >= t.target,
        progress: Math.min(value, t.target),
        target: t.target,
      };
    });

    return {
      achievements,
      unlockedCount: achievements.filter((a) => a.unlocked).length,
      total: achievements.length,
    };
  }
}

export const achievementService = new AchievementService();
