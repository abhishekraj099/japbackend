import { db } from "../../config/database.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { weakPointService } from "../analytics/weak-point.service.js";
import { coverageService } from "../coverage/coverage.service.js";
import { ReviewService } from "../reviews/review.service.js";

/**
 * Study Planner & Daily Coach (Phase 53). Read-only: composes analytics,
 * weak-points, coverage, and due-card data into a prioritized daily plan,
 * time estimates, session presets, and a daily score. No FSRS/AI/schema
 * changes; reuses existing services + one leech-count query.
 *
 * NOTE: the mining queue is client-side (extension storage), so the web planner
 * covers reviews / leeches / grammar / JLPT only — mining stays in the Mining
 * Center.
 */

const reviewService = new ReviewService();
const AVG_REVIEW_SEC = 8;
const GRAMMAR_SEC = 45;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const mins = (sec: number) => Math.max(1, Math.round(sec / 60));

export class PlannerService {
  private async leechCount(userId: string): Promise<number> {
    const rows = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM (
        SELECT rl."cardId"
        FROM review_logs rl JOIN cards c ON c.id = rl."cardId" JOIN decks d ON d.id = c."deckId"
        WHERE d."userId" = ${userId} AND c."deletedAt" IS NULL
        GROUP BY rl."cardId"
        HAVING COUNT(*) >= 8 AND (COUNT(*) FILTER (WHERE rl.rating >= 3))::float / COUNT(*) < 0.6
      ) x`;
    return Number(rows[0]?.n ?? 0);
  }

  async getToday(userId: string) {
    const [overview, reviewStats, streaks, weak, coverage, dueCards, leeches] = await Promise.all([
      analyticsService.getOverview(userId),
      analyticsService.getReviewStats(userId),
      analyticsService.getStreaks(userId),
      weakPointService.getWeakPoints(userId),
      coverageService.getCoverage(userId),
      reviewService.getDueCards(userId, 100),
      this.leechCount(userId),
    ]);

    const due = dueCards.length;
    const reviewsToday = reviewStats.reviewsToday;
    const retention = overview.overallRetention;
    const streak = streaks.currentStreak;
    const animeCoverage = coverage.categories.find((c) => c.id === "anime")?.coveragePercent ?? 0;
    const weakGrammar = weak.grammar.mostFailed.length;
    const weakJlpt = weak.recommendations.weakestJlpt;

    // ── Priority queue ────────────────────────────────────────────────────────
    const priorities: Array<{ key: string; label: string; count: number; route: string; minutes: number }> = [];
    if (due > 0) priorities.push({ key: "overdue", label: `${due} review${due === 1 ? "" : "s"} due`, count: due, route: "/review", minutes: mins(due * AVG_REVIEW_SEC) });
    if (leeches > 0) priorities.push({ key: "leeches", label: `${leeches} leech${leeches === 1 ? "" : "es"}`, count: leeches, route: "/review?focus=leeches", minutes: mins(leeches * AVG_REVIEW_SEC) });
    if (weakGrammar > 0) priorities.push({ key: "weak-grammar", label: `${Math.min(weakGrammar, 10)} weak grammar cards`, count: Math.min(weakGrammar, 10), route: "/review?focus=weak-grammar", minutes: mins(Math.min(weakGrammar, 10) * AVG_REVIEW_SEC) });
    if (weakJlpt && weakJlpt.retentionPct != null && weakJlpt.retentionPct < 80)
      priorities.push({ key: "weak-jlpt", label: `Practice ${weakJlpt.level} (${weakJlpt.retentionPct}%)`, count: 1, route: `/review?focus=jlpt&jlpt=${weakJlpt.level}`, minutes: 5 });
    priorities.push({ key: "new-grammar", label: "Learn 3 new grammar points", count: 3, route: "/grammar", minutes: mins(3 * GRAMMAR_SEC) });

    // ── Daily score ───────────────────────────────────────────────────────────
    const dueCompletion = due + reviewsToday > 0 ? (reviewsToday / (due + reviewsToday)) * 100 : 100;
    const streakFactor = Math.min(streak / 7, 1) * 100;
    const dailyScore = Math.round(clamp(dueCompletion * 0.4 + retention * 0.3 + streakFactor * 0.2 + animeCoverage * 0.1));

    // ── Time estimates ─────────────────────────────────────────────────────────
    const estimates = {
      dueReviews: { count: due, minutes: mins(due * AVG_REVIEW_SEC) },
      leeches: { count: leeches, minutes: mins(leeches * AVG_REVIEW_SEC) },
      total: { minutes: mins((due + leeches) * AVG_REVIEW_SEC + 3 * GRAMMAR_SEC) },
    };

    // ── Session presets ─────────────────────────────────────────────────────────
    const session = (reviewCap: number, grammarTarget: number) => {
      const reviewTarget = Math.min(due, reviewCap);
      return { reviewTarget, grammarTarget, minutes: mins(reviewTarget * AVG_REVIEW_SEC + grammarTarget * GRAMMAR_SEC) };
    };
    const sessions = { quick: session(15, 1), standard: session(30, 2), deep: session(60, 3) };

    // ── Recommended session ─────────────────────────────────────────────────────
    let recommended: { text: string; route: string };
    if (due > 0) recommended = { text: `Review ${Math.min(due, 20)} due card${due === 1 ? "" : "s"}.`, route: "/review" };
    else if (leeches > 0) recommended = { text: `Review ${leeches} leech${leeches === 1 ? "" : "es"}.`, route: "/review?focus=leeches" };
    else if (weakJlpt && weakJlpt.retentionPct != null && weakJlpt.retentionPct < 80) recommended = { text: `Practice ${weakJlpt.level} grammar.`, route: `/review?focus=jlpt&jlpt=${weakJlpt.level}` };
    else recommended = { text: "Learn new grammar.", route: "/grammar" };

    const quickStart = [
      { label: "Review Due", route: "/review", count: due },
      { label: "Review Leeches", route: "/review?focus=leeches", count: leeches },
      ...(weakJlpt ? [{ label: `Review ${weakJlpt.level}`, route: `/review?focus=jlpt&jlpt=${weakJlpt.level}`, count: 0 }] : []),
      { label: "Coverage", route: "/coverage", count: 0 },
    ];

    return {
      dailyScore,
      scoreBreakdown: { dueCompletion: Math.round(dueCompletion), retention, streak, coverage: animeCoverage },
      priorities,
      recommended,
      estimates,
      sessions,
      quickStart,
    };
  }
}

export const plannerService = new PlannerService();
