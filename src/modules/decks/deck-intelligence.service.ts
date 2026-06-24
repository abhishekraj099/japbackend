import { db } from "../../config/database.js";
import { DeckService } from "./deck.service.js";

/**
 * Deck Intelligence (Phase 51). Read-only per-deck analysis from existing
 * cards + FSRS schedules + review history. No FSRS/review/AI/schema changes,
 * no per-card requests — two aggregated queries.
 */

const deckService = new DeckService();
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const clamp = (n: number) => Math.max(0, Math.min(100, n));

// Stability bands (days) for maturity buckets.
const KNOWN = 7;
const MATURE = 21;
const MASTERED = 60;
const LEECH_REVIEWS = 8;
const LEECH_RETENTION = 60;

export class DeckIntelligenceService {
  async getIntelligence(deckId: string, userId: string) {
    await deckService.getById(deckId, userId); // ownership check (404 otherwise)

    const [schedules, reviewAgg] = await Promise.all([
      db.cardSchedule.findMany({
        where: { card: { deckId, deletedAt: null } },
        select: { cardId: true, stability: true, difficulty: true, reps: true, lapses: true, dueDate: true, state: true, card: { select: { question: true } } },
      }),
      db.$queryRaw<Array<{ cardId: string; total: bigint; fails: bigint; passes: bigint }>>`
        SELECT rl."cardId" AS "cardId",
               COUNT(*) AS "total",
               COUNT(*) FILTER (WHERE rl.rating = 1) AS "fails",
               COUNT(*) FILTER (WHERE rl.rating >= 3) AS "passes"
        FROM review_logs rl
        JOIN cards c ON c.id = rl."cardId"
        WHERE c."deckId" = ${deckId} AND c."deletedAt" IS NULL
        GROUP BY rl."cardId"
      `,
    ]);

    const total = schedules.length;
    const stats = new Map(reviewAgg.map((r) => [r.cardId, { total: Number(r.total), fails: Number(r.fails), passes: Number(r.passes) }]));
    const now = Date.now();

    // ── Maturity distribution ─────────────────────────────────────────────────
    const maturity = { new: 0, learning: 0, known: 0, mature: 0, mastered: 0 };
    let overdue = 0;
    let difficultySum = 0;
    for (const s of schedules) {
      if (s.dueDate.getTime() <= now) overdue++;
      difficultySum += s.difficulty;
      if (s.reps === 0) maturity.new++;
      else if (s.stability < KNOWN) maturity.learning++;
      else if (s.stability < MATURE) maturity.known++;
      else if (s.stability < MASTERED) maturity.mature++;
      else maturity.mastered++;
    }

    // ── Review stats (deck-wide) ─────────────────────────────────────────────
    let allTotal = 0, allFails = 0, allPasses = 0;
    for (const v of stats.values()) { allTotal += v.total; allFails += v.fails; allPasses += v.passes; }
    const retention = pct(allPasses, allTotal);
    const againRate = pct(allFails, allTotal);

    // ── Leeches ───────────────────────────────────────────────────────────────
    const leeches = schedules
      .map((s) => {
        const st = stats.get(s.cardId);
        if (!st || st.total < LEECH_REVIEWS) return null;
        const ret = pct(st.passes, st.total);
        if (ret >= LEECH_RETENTION) return null;
        return { id: s.cardId, word: s.card.question, reviewCount: st.total, failCount: st.fails, retention: ret };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.failCount - a.failCount)
      .slice(0, 15);

    // ── Health score ──────────────────────────────────────────────────────────
    const overduePct = pct(overdue, total);
    const leechPct = pct(leeches.length, total);
    const maturePct = pct(maturity.mature + maturity.mastered, total);
    const health = Math.round(clamp(retention * 0.4 + (100 - overduePct) * 0.3 + (100 - leechPct) * 0.2 + maturePct * 0.1));

    // ── Difficulty score ──────────────────────────────────────────────────────
    const avgDifficulty = total > 0 ? difficultySum / total : 0; // FSRS difficulty (1–10)
    const difficultyScore = Math.round(clamp((avgDifficulty / 10) * 70 + againRate * 0.3));
    const difficultyBand =
      difficultyScore < 30 ? "Easy" : difficultyScore < 55 ? "Moderate" : difficultyScore < 75 ? "Hard" : "Very Hard";

    // ── Forecast (cumulative due counts) ──────────────────────────────────────
    const day = 86400000;
    const dueBy = (days: number) => schedules.filter((s) => s.dueDate.getTime() <= now + days * day).length;
    const forecast = { tomorrow: dueBy(1), sevenDays: dueBy(7), thirtyDays: dueBy(30) };

    // ── Recommendations ───────────────────────────────────────────────────────
    const recommendations: string[] = [];
    if (overdue > 0) recommendations.push(`${overdue} card${overdue === 1 ? " is" : "s are"} overdue.`);
    if (allTotal >= 10 && retention < 80) recommendations.push(`Deck retention is only ${retention}%.`);
    if (leeches.length > 0) recommendations.push(`${leeches.length} leech${leeches.length === 1 ? "" : "es"} are consuming review time.`);
    if (maturity.new + maturity.learning > total * 0.5 && total > 0) recommendations.push("Most cards are still young — keep reviewing to mature them.");
    if (overdue > 20 || leeches.length > 5) recommendations.push("A focus review session is recommended.");
    if (!recommendations.length) recommendations.push("This deck is in good shape — keep it up.");

    return {
      totalCards: total,
      health,
      difficulty: { score: difficultyScore, band: difficultyBand, avgDifficulty: Math.round(avgDifficulty * 10) / 10, againRate },
      retention,
      overdue,
      maturity,
      leeches,
      forecast,
      recommendations,
    };
  }
}

export const deckIntelligenceService = new DeckIntelligenceService();
