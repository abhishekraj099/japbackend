import { db } from "../../config/database.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { weakPointService } from "../analytics/weak-point.service.js";
import { coverageService } from "../coverage/coverage.service.js";
import { ReviewService } from "../reviews/review.service.js";

/**
 * Study Missions (Phase 41). Generates 3–5 personalized daily goals from the
 * learner's real data by REUSING the analytics / weak-point / coverage / review
 * services — no duplicate calculations, no AI, read-only, no schedule mutation.
 */

const reviewService = new ReviewService();
const COVERAGE_BANDS = [50, 70, 85, 95];
const NEAR_GAP = 15; // only suggest a coverage mission within this % of the next band

export type MissionCategory = "Review" | "Grammar" | "Coverage" | "JLPT" | "Weakness";

export interface Mission {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  category: MissionCategory;
  route: string; // where "Start" navigates
}

export class MissionService {
  async getToday(userId: string): Promise<{ missions: Mission[]; generatedAt: string }> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [dueCards, reviewStats, weak, coverage, grammarSavedToday] = await Promise.all([
      reviewService.getDueCards(userId, 100),
      analyticsService.getReviewStats(userId),
      weakPointService.getWeakPoints(userId),
      coverageService.getCoverage(userId),
      db.card.count({
        where: { cardType: "grammar", deck: { userId }, deletedAt: null, createdAt: { gte: startOfDay } },
      }),
    ]);

    const missions: Mission[] = [];
    const dueCount = dueCards.length;
    const reviewsToday = reviewStats.reviewsToday;

    // 1. Review mission — clear today's due queue (cap 20).
    if (dueCount > 0 || reviewsToday > 0) {
      const target = Math.min(20, Math.max(dueCount + reviewsToday, 1));
      const progress = Math.min(reviewsToday, target);
      missions.push({
        id: "review-due",
        title: `Review ${target} due cards`,
        description: "Clear your scheduled reviews for today.",
        progress,
        target,
        completed: dueCount === 0 || progress >= target,
        category: "Review",
        route: "/review",
      });
    }

    // 2. Weakness mission — target the weakest grammar (else weak vocab).
    const weakGrammar = weak.grammar.mostFailed.length;
    if (weakGrammar > 0) {
      const target = Math.min(10, weakGrammar);
      missions.push({
        id: "weak-grammar",
        title: `Review ${target} weak grammar cards`,
        description: weak.recommendations.weakestGrammar
          ? `You repeatedly miss ${weak.recommendations.weakestGrammar.label}.`
          : "Reinforce the grammar you miss most.",
        progress: 0,
        target,
        completed: false,
        category: "Weakness",
        route: "/review?focus=weak-grammar",
      });
    } else if (weak.vocabulary.mostFailed.length > 0) {
      const target = Math.min(10, weak.vocabulary.mostFailed.length);
      missions.push({
        id: "weak-vocab",
        title: `Review ${target} weak words`,
        description: "Reinforce the vocabulary you miss most.",
        progress: 0,
        target,
        completed: false,
        category: "Weakness",
        route: "/review?focus=weak-vocab",
      });
    }

    // 3. JLPT mission — lift the weakest level's retention above 80%.
    const wj = weak.recommendations.weakestJlpt;
    if (wj && wj.retentionPct != null && wj.retentionPct < 80) {
      missions.push({
        id: `jlpt-${wj.level}`,
        title: `Improve ${wj.level} retention above 80%`,
        description: `${wj.level} retention is ${wj.retentionPct}%. Review weak ${wj.level} cards to raise it.`,
        progress: Math.round(wj.retentionPct),
        target: 80,
        completed: false,
        category: "JLPT",
        route: `/review?focus=jlpt&jlpt=${wj.level}`,
      });
    }

    // 4. Grammar mission — learn new grammar points today.
    {
      const target = 3;
      missions.push({
        id: "grammar-new",
        title: `Learn ${target} new grammar points`,
        description: "Save new grammar patterns from the extension to your library.",
        progress: Math.min(grammarSavedToday, target),
        target,
        completed: grammarSavedToday >= target,
        category: "Grammar",
        route: "/grammar",
      });
    }

    // 5. Coverage mission — only when near the next band.
    let bestCov: { label: string; pct: number; next: number } | null = null;
    for (const c of coverage.categories) {
      const next = COVERAGE_BANDS.find((b) => b > c.coveragePercent);
      if (next && next - c.coveragePercent <= NEAR_GAP) {
        if (!bestCov || next - c.coveragePercent < bestCov.next - bestCov.pct) {
          bestCov = { label: c.label, pct: c.coveragePercent, next };
        }
      }
    }
    if (bestCov) {
      missions.push({
        id: "coverage",
        title: `Reach ${bestCov.next}% ${bestCov.label} Coverage`,
        description: `You're at ${bestCov.pct}% — keep learning high-frequency words to get there.`,
        progress: bestCov.pct,
        target: bestCov.next,
        completed: false,
        category: "Coverage",
        route: "/coverage",
      });
    }

    // Keep 3–5: prioritize actionable order, drop overflow.
    const ordered = missions.slice(0, 5);
    return { missions: ordered, generatedAt: new Date().toISOString() };
  }
}

export const missionService = new MissionService();
