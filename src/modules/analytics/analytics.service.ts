import { db } from "../../config/database.js";

/**
 * Learning analytics (Phase 34). Read-only, computed entirely from existing
 * data (cards, schedules, review_logs, JLPT/frequency metadata) via DB
 * aggregation — no duplicate tracking tables, no writes, no FSRS/review impact.
 *
 * "Known" mirrors the word-status convention: FSRS stability ≥ 21 days
 * (the Anki "mature" threshold). All counts run as parallel COUNT/GROUP BY
 * queries so the full dashboard resolves well under the 500 ms target.
 */

const MATURE_STABILITY = 21;
const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

function boundaries() {
  const now = new Date();
  const day = 86400000;
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    today: startOfDay,
    week: new Date(startOfDay.getTime() - 6 * day), // rolling 7 days (incl. today)
    month: new Date(startOfDay.getTime() - 29 * day), // rolling 30 days
  };
}

export class AnalyticsService {
  private vocabWhere(userId: string) {
    return { cardType: "vocab", deck: { userId }, deletedAt: null as Date | null };
  }
  private reviewWhere(userId: string) {
    return { card: { deck: { userId } } };
  }

  async getOverview(userId: string) {
    const v = this.vocabWhere(userId);
    const known = { ...v, schedule: { stability: { gte: MATURE_STABILITY } } };
    const [totalSavedWords, knownWords, totalWithFreq, knownWithFreq, passAll, totalAll] = await Promise.all([
      db.card.count({ where: v }),
      db.card.count({ where: known }),
      db.card.count({ where: { ...v, frequency: { not: null } } }),
      db.card.count({ where: { ...known, frequency: { not: null } } }),
      db.reviewLog.count({ where: { ...this.reviewWhere(userId), rating: { gte: 3 } } }),
      db.reviewLog.count({ where: this.reviewWhere(userId) }),
    ]);
    const learningWords = totalSavedWords - knownWords;
    return {
      knownWords,
      learningWords,
      ignoredWords: 0, // not tracked server-side (extension-local) — see limitations
      totalSavedWords,
      knownFrequencyCoverage: pct(knownWithFreq, totalWithFreq),
      learningFrequencyCoverage: pct(totalWithFreq - knownWithFreq, totalWithFreq),
      overallRetention: pct(passAll, totalAll),
    };
  }

  async getJlptProgress(userId: string) {
    const rows = await db.card.groupBy({
      by: ["jlptLevel"],
      where: { ...this.vocabWhere(userId), schedule: { stability: { gte: MATURE_STABILITY } } },
      _count: { _all: true },
    });
    const byLevel = new Map(rows.map((r) => [r.jlptLevel, r._count._all]));
    return {
      jlptN5Known: byLevel.get("N5") ?? 0,
      jlptN4Known: byLevel.get("N4") ?? 0,
      jlptN3Known: byLevel.get("N3") ?? 0,
      jlptN2Known: byLevel.get("N2") ?? 0,
      jlptN1Known: byLevel.get("N1") ?? 0,
    };
  }

  async getReviewStats(userId: string) {
    const rw = this.reviewWhere(userId);
    const b = boundaries();
    const [totalReviews, reviewsToday, reviewsThisWeek, reviewsThisMonth, pass7, total7, pass30, total30] =
      await Promise.all([
        db.reviewLog.count({ where: rw }),
        db.reviewLog.count({ where: { ...rw, reviewedAt: { gte: b.today } } }),
        db.reviewLog.count({ where: { ...rw, reviewedAt: { gte: b.week } } }),
        db.reviewLog.count({ where: { ...rw, reviewedAt: { gte: b.month } } }),
        db.reviewLog.count({ where: { ...rw, rating: { gte: 3 }, reviewedAt: { gte: b.week } } }),
        db.reviewLog.count({ where: { ...rw, reviewedAt: { gte: b.week } } }),
        db.reviewLog.count({ where: { ...rw, rating: { gte: 3 }, reviewedAt: { gte: b.month } } }),
        db.reviewLog.count({ where: { ...rw, reviewedAt: { gte: b.month } } }),
      ]);
    return {
      totalReviews,
      reviewsToday,
      reviewsThisWeek,
      reviewsThisMonth,
      sevenDayRetention: pct(pass7, total7),
      thirtyDayRetention: pct(pass30, total30),
    };
  }

  async getGrowthStats(userId: string) {
    const v = this.vocabWhere(userId);
    const b = boundaries();
    const [wordsAddedToday, wordsAddedThisWeek, wordsAddedThisMonth] = await Promise.all([
      db.card.count({ where: { ...v, createdAt: { gte: b.today } } }),
      db.card.count({ where: { ...v, createdAt: { gte: b.week } } }),
      db.card.count({ where: { ...v, createdAt: { gte: b.month } } }),
    ]);
    return { wordsAddedToday, wordsAddedThisWeek, wordsAddedThisMonth };
  }

  /** Consecutive-day streaks (UTC) from distinct review days — bounded by the
   *  number of active days, not the number of reviews. */
  async getStreaks(userId: string) {
    const rows = await db.$queryRaw<{ d: Date }[]>`
      SELECT DISTINCT (rl."reviewedAt" AT TIME ZONE 'UTC')::date AS d
      FROM review_logs rl
      JOIN cards c ON c.id = rl."cardId"
      JOIN decks dk ON dk.id = c."deckId"
      WHERE dk."userId" = ${userId}
      ORDER BY d DESC
    `;
    if (rows.length === 0) return { currentStreak: 0, longestStreak: 0 };

    const dayMs = 86400000;
    const toDay = (date: Date) =>
      Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / dayMs);
    const days = rows.map((r) => toDay(new Date(r.d)));
    const today = toDay(new Date());

    const currentStreak = (() => {
      if (today - days[0] > 1) return 0;
      let s = 1;
      for (let i = 1; i < days.length; i++) {
        if (days[i - 1] - days[i] === 1) s++;
        else break;
      }
      return s;
    })();

    let longestStreak = 1;
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      if (days[i - 1] - days[i] === 1) run++;
      else run = 1;
      if (run > longestStreak) longestStreak = run;
    }
    return { currentStreak, longestStreak };
  }

  /** Full dashboard payload — all sections in parallel. */
  async getDashboard(userId: string) {
    const [overview, jlpt, reviews, growth, streaks] = await Promise.all([
      this.getOverview(userId),
      this.getJlptProgress(userId),
      this.getReviewStats(userId),
      this.getGrowthStats(userId),
      this.getStreaks(userId),
    ]);
    return {
      overview: { ...overview, ...streaks },
      jlpt,
      reviews,
      growth,
      jlptLevels: JLPT_LEVELS,
    };
  }
}

export const analyticsService = new AnalyticsService();
