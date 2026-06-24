import { db } from "../../config/database.js";
import { GRAMMAR_PATTERNS } from "../../data/grammar-patterns.data.js";

/**
 * Grammar Mastery System (Phase 44). Read-only analytics layer joining the
 * grammar dataset (91 patterns) with the learner's saved grammar cards + FSRS
 * schedules. No new storage, no FSRS/review/detection changes, no mutation.
 *
 * Mastery rules (per dataset pattern, matched by patternId):
 *   discovered = a saved grammar card exists
 *   learned    = schedule.reps > 0
 *   known      = schedule.stability >= 21
 *   mastered   = schedule.stability >= 60
 *   missing    = pattern in dataset but no saved card
 */

const KNOWN = 21;
const MASTERED = 60;
const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"];

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

interface PatternStatus {
  id: string;
  name: string;
  jlptLevel: string;
  discovered: boolean;
  learned: boolean;
  known: boolean;
  mastered: boolean;
}

export class GrammarMasteryService {
  async getMastery(userId: string) {
    const cards = await db.card.findMany({
      where: { cardType: "grammar", deck: { userId }, deletedAt: null, patternId: { not: null } },
      select: { patternId: true, schedule: { select: { stability: true, reps: true } } },
    });
    const byPattern = new Map(cards.map((c) => [c.patternId!, c.schedule]));

    const statuses: PatternStatus[] = GRAMMAR_PATTERNS.map((p) => {
      const s = byPattern.get(p.id);
      const stability = s?.stability ?? 0;
      const reps = s?.reps ?? 0;
      return {
        id: p.id,
        name: p.name,
        jlptLevel: p.jlptLevel,
        discovered: !!s || byPattern.has(p.id),
        learned: reps > 0,
        known: stability >= KNOWN,
        mastered: stability >= MASTERED,
      };
    });

    const tally = (list: PatternStatus[]) => ({
      total: list.length,
      discovered: list.filter((x) => x.discovered).length,
      learned: list.filter((x) => x.learned).length,
      known: list.filter((x) => x.known).length,
      mastered: list.filter((x) => x.mastered).length,
      missing: list.filter((x) => !x.discovered).length,
    });

    const totals = tally(statuses);

    const jlptBreakdown = JLPT_LEVELS.map((level) => {
      const t = tally(statuses.filter((x) => x.jlptLevel === level));
      return {
        level,
        ...t,
        masteredPct: pct(t.mastered, t.total),
        discoveredPct: pct(t.discovered, t.total),
      };
    });

    const discovered = statuses.filter((x) => x.discovered);
    const mastered = statuses.filter((x) => x.mastered);
    const missing = statuses.filter((x) => !x.discovered).map((x) => ({ id: x.id, name: x.name, jlptLevel: x.jlptLevel }));

    // ── Recommendations (rule-based) ─────────────────────────────────────────
    const recommendations: string[] = [];
    // Largest gap: level with the most missing patterns.
    const byGap = [...jlptBreakdown].filter((j) => j.missing > 0).sort((a, b) => b.missing - a.missing);
    if (byGap[0]) recommendations.push(`${byGap[0].level} is your largest grammar gap — ${byGap[0].missing} patterns missing.`);
    // Near-complete level: discovered all but a few.
    const nearDone = jlptBreakdown.find((j) => j.total > 0 && j.missing > 0 && j.missing <= 5 && j.discovered > 0);
    if (nearDone) recommendations.push(`Only ${nearDone.missing} ${nearDone.level} pattern${nearDone.missing === 1 ? "" : "s"} remain — finish them.`);
    // Mastery progress on the most-advanced discovered level.
    const masteryLevel = [...jlptBreakdown].reverse().find((j) => j.discovered > 0);
    if (masteryLevel) recommendations.push(`You have mastered ${masteryLevel.masteredPct}% of ${masteryLevel.level} grammar.`);
    // Learn-more on the lowest level with missing patterns (start from the basics).
    const startLevel = jlptBreakdown.find((j) => j.missing > 0);
    if (startLevel) recommendations.push(`Learn ${Math.min(startLevel.missing, 5)} more ${startLevel.level} pattern${startLevel.missing === 1 ? "" : "s"}.`);
    // Master more on a level that's discovered but under-mastered.
    const toMaster = jlptBreakdown.find((j) => j.discovered > 0 && j.mastered < j.discovered);
    if (toMaster) recommendations.push(`Master ${Math.min(toMaster.discovered - toMaster.mastered, 10)} more ${toMaster.level} patterns through review.`);
    if (!recommendations.length) recommendations.push("Save grammar patterns from the extension to start tracking mastery.");

    return {
      totals,
      jlptBreakdown,
      discovered,
      mastered,
      missing,
      recommendations: recommendations.slice(0, 5),
    };
  }
}

export const grammarMasteryService = new GrammarMasteryService();
