import { db } from "../../config/database.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { weakPointService } from "../analytics/weak-point.service.js";
import { coverageService } from "../coverage/coverage.service.js";
import { ReviewService } from "../reviews/review.service.js";

/**
 * Learning Roadmap (Phase 43). Read-only: composes the analytics / weak-point /
 * coverage / review aggregations into "where you are, what's missing, what's
 * next". No new tables, no duplicate calculations, no AI, no schedule mutation.
 */

const reviewService = new ReviewService();

// Level thresholds by known-word count (the reliable signal). Grammar is folded
// in as a secondary gate; per-level grammar totals aren't tracked, so the level
// is vocab-anchored (see honest limitations).
const LEVELS = [
  { level: "N5", vocab: 800 },
  { level: "N4", vocab: 1500 },
  { level: "N3", vocab: 3000 },
  { level: "N2", vocab: 6000 },
  { level: "N1", vocab: 10000 },
];
const COVERAGE_BANDS = [50, 70, 85, 95];

export interface Recommendation {
  text: string;
  route: string;
}

export class RoadmapService {
  async getRoadmap(userId: string) {
    const [overview, reviewStats, weak, coverage, dueCards, grammarCount] = await Promise.all([
      analyticsService.getOverview(userId),
      analyticsService.getReviewStats(userId),
      weakPointService.getWeakPoints(userId),
      coverageService.getCoverage(userId),
      reviewService.getDueCards(userId, 100),
      db.card.count({ where: { cardType: "grammar", deck: { userId }, deletedAt: null } }),
    ]);

    const known = overview.knownWords;

    // ── Current level + progress to next ──────────────────────────────────────
    let idx = -1;
    for (let i = 0; i < LEVELS.length; i++) if (known >= LEVELS[i].vocab) idx = i;
    const current = idx >= 0 ? LEVELS[idx] : { level: "Pre-N5", vocab: 0 };
    const next = LEVELS[idx + 1] ?? null;
    const lowerBound = idx >= 0 ? current.vocab : 0;
    const upperBound = next ? next.vocab : current.vocab;
    const progressToNext = next ? Math.min(100, Math.round(((known - lowerBound) / (upperBound - lowerBound)) * 100)) : 100;

    // ── Strengths / weaknesses ────────────────────────────────────────────────
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    for (const c of coverage.categories) {
      if (c.coveragePercent >= 70) strengths.push(`${c.label} coverage (${c.coveragePercent}%)`);
      else if (c.coveragePercent < 40) weaknesses.push(`${c.label} coverage (${c.coveragePercent}%)`);
    }
    if (next && known >= lowerBound + (upperBound - lowerBound) * 0.6) strengths.push(`Vocabulary size (${known} known)`);
    for (const j of weak.jlpt) {
      if (j.reviews >= 3 && j.retentionPct != null) {
        if (j.retentionPct >= 85) strengths.push(`${j.level} retention (${j.retentionPct}%)`);
        else if (j.retentionPct < 70) weaknesses.push(`${j.level} retention (${j.retentionPct}%)`);
      }
    }
    const wb = weak.recommendations.weakestFrequencyBand;
    if (wb && wb.retentionPct != null && wb.retentionPct < 70) weaknesses.push(`${wb.band} retention (${wb.retentionPct}%)`);
    if (grammarCount < 30) weaknesses.push(`Grammar library is small (${grammarCount} saved)`);

    // ── Next goals ────────────────────────────────────────────────────────────
    const nextGoals: string[] = [];
    if (next) nextGoals.push(`Reach ${next.vocab} known words to advance to ${next.level} (${known}/${next.vocab}).`);
    const anime = coverage.categories.find((c) => c.id === "anime");
    if (anime) {
      const band = COVERAGE_BANDS.find((b) => b > anime.coveragePercent);
      if (band) nextGoals.push(`Reach ${band}% Anime coverage (now ${anime.coveragePercent}%).`);
    }
    if (grammarCount < 100) nextGoals.push(`Grow your grammar library to 100 patterns (now ${grammarCount}).`);

    // ── Recommendations (rule-based, top 5) ───────────────────────────────────
    const recs: Recommendation[] = [];
    if (dueCards.length > 0) recs.push({ text: `Finish ${Math.min(dueCards.length, 20)} due reviews.`, route: "/review" });
    if (weak.recommendations.weakestGrammar)
      recs.push({ text: `Review weak grammar: ${weak.recommendations.weakestGrammar.label}.`, route: "/review?focus=weak-grammar" });
    if (weak.recommendations.weakestJlpt && weak.recommendations.weakestJlpt.retentionPct != null && weak.recommendations.weakestJlpt.retentionPct < 80)
      recs.push({ text: `Raise ${weak.recommendations.weakestJlpt.level} retention above 80% (now ${weak.recommendations.weakestJlpt.retentionPct}%).`, route: `/review?focus=jlpt&jlpt=${weak.recommendations.weakestJlpt.level}` });
    if (wb && wb.retentionPct != null && wb.retentionPct < 80)
      recs.push({ text: `Increase ${wb.band} frequency retention (now ${wb.retentionPct}%).`, route: `/review?focus=frequency&band=${wb.band === "Top 1k" ? "top1k" : wb.band === "Top 3k" ? "top3k" : wb.band === "Top 5k" ? "top5k" : "5kplus"}` });
    if (anime) {
      const band = COVERAGE_BANDS.find((b) => b > anime.coveragePercent);
      if (band && band - anime.coveragePercent <= 20) recs.push({ text: `Reach ${band}% Anime coverage (now ${anime.coveragePercent}%).`, route: "/coverage" });
    }
    if (grammarCount < 100) recs.push({ text: `Learn more grammar — add patterns to your library.`, route: "/grammar" });

    return {
      currentLevel: current.level,
      nextLevel: next?.level ?? null,
      progressToNext,
      knownWords: known,
      savedWords: overview.totalSavedWords,
      grammarSaved: grammarCount,
      strengths: strengths.slice(0, 4),
      weaknesses: weaknesses.slice(0, 4),
      nextGoals: nextGoals.slice(0, 4),
      recommendations: recs.slice(0, 5),
    };
  }
}

export const roadmapService = new RoadmapService();
