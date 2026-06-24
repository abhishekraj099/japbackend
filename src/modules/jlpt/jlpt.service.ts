import { analyticsService } from "../analytics/analytics.service.js";
import { weakPointService } from "../analytics/weak-point.service.js";
import { coverageService } from "../coverage/coverage.service.js";
import { grammarMasteryService } from "../grammar/grammar-mastery.service.js";

/**
 * JLPT Preparation Center (Phase 45). Read-only aggregation that composes the
 * grammar-mastery, analytics, coverage, and weak-point services into a per-level
 * readiness view. No new tables, no duplicate storage, no FSRS/review changes.
 *
 * Readiness = 40% vocab + 30% grammar + 20% retention + 10% coverage (0–100).
 */

const LEVELS = [
  { level: "N5", vocabTarget: 800 },
  { level: "N4", vocabTarget: 1500 },
  { level: "N3", vocabTarget: 3000 },
  { level: "N2", vocabTarget: 6000 },
  { level: "N1", vocabTarget: 10000 },
];
const COVERAGE_BANDS = [50, 70, 85, 95];

const clamp = (n: number) => Math.max(0, Math.min(100, n));

function band(r: number): string {
  if (r < 40) return "Beginning";
  if (r < 60) return "Developing";
  if (r < 80) return "Approaching";
  if (r < 95) return "Ready";
  return "Exam Ready";
}

export class JLPTService {
  async getOverview(userId: string) {
    const [overview, reviewStats, weak, coverage, mastery] = await Promise.all([
      analyticsService.getOverview(userId),
      analyticsService.getReviewStats(userId),
      weakPointService.getWeakPoints(userId),
      coverageService.getCoverage(userId),
      grammarMasteryService.getMastery(userId),
    ]);

    const known = overview.knownWords;
    const animeCoverage = coverage.categories.find((c) => c.id === "anime")?.coveragePercent ?? 0;
    const weakJlpt = new Map(weak.jlpt.map((j) => [j.level, j]));
    const masteryByLevel = new Map(mastery.jlptBreakdown.map((j) => [j.level, j]));

    const levels = LEVELS.map((cfg) => {
      const gm = masteryByLevel.get(cfg.level);
      const grammarKnown = gm?.known ?? 0;
      const grammarTotal = gm?.total ?? 0;
      const wj = weakJlpt.get(cfg.level);
      const retention = wj?.retentionPct ?? overview.overallRetention ?? 0;

      const vocabPct = clamp((known / cfg.vocabTarget) * 100);
      const grammarPct = grammarTotal > 0 ? clamp((grammarKnown / grammarTotal) * 100) : 0;
      const readiness = Math.round(clamp(vocabPct * 0.4 + grammarPct * 0.3 + retention * 0.2 + animeCoverage * 0.1));

      const strengths: string[] = [];
      const weaknesses: string[] = [];
      if (vocabPct >= 80) strengths.push("Vocabulary"); else if (vocabPct < 50) weaknesses.push("Vocabulary");
      if (grammarPct >= 80) strengths.push("Grammar"); else if (grammarPct < 50) weaknesses.push("Grammar");
      if (retention >= 85) strengths.push("Retention"); else if (retention < 70) weaknesses.push("Retention");
      if (animeCoverage >= 70) strengths.push("Coverage"); else if (animeCoverage < 40) weaknesses.push("Coverage");

      return {
        level: cfg.level,
        vocabKnown: known,
        vocabTarget: cfg.vocabTarget,
        grammarKnown,
        grammarTotal,
        grammarMissing: gm?.missing ?? grammarTotal,
        coverage: animeCoverage,
        retention: Math.round(retention),
        readiness,
        status: band(readiness),
        strengths,
        weaknesses,
      };
    });

    // Current working level = first level not yet "Ready" (<80), else N1.
    const current = levels.find((l) => l.readiness < 80) ?? levels[levels.length - 1];

    // ── Recommendations (rule-based, top 5) ──────────────────────────────────
    const recs: Array<{ text: string; route: string }> = [];
    if (known < current.vocabTarget)
      recs.push({ text: `Learn ${current.vocabTarget - known} more words for ${current.level} (${known}/${current.vocabTarget}).`, route: "/review" });
    if (current.grammarMissing > 0)
      recs.push({ text: `Learn ${Math.min(current.grammarMissing, 10)} more ${current.level} grammar patterns (${current.grammarMissing} missing).`, route: "/grammar/mastery" });
    const wj = weak.recommendations.weakestJlpt;
    if (wj && wj.retentionPct != null && wj.retentionPct < 80)
      recs.push({ text: `Raise ${wj.level} retention above 80% (now ${wj.retentionPct}%).`, route: `/review?focus=jlpt&jlpt=${wj.level}` });
    if (weak.recommendations.weakestGrammar)
      recs.push({ text: `Review weak grammar: ${weak.recommendations.weakestGrammar.label}.`, route: "/review?focus=weak-grammar" });
    const nextBand = COVERAGE_BANDS.find((b) => b > animeCoverage);
    if (nextBand && nextBand - animeCoverage <= 20)
      recs.push({ text: `Reach ${nextBand}% Anime coverage (now ${animeCoverage}%).`, route: "/coverage" });
    if (reviewStats.reviewsToday === 0)
      recs.push({ text: "Do today's reviews to keep retention up.", route: "/review" });

    return {
      currentLevel: current.level,
      readiness: current.readiness,
      status: current.status,
      levels,
      recommendations: recs.slice(0, 5),
    };
  }
}

export const jlptService = new JLPTService();
