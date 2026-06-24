import { db } from "../../config/database.js";

/**
 * Weak Point Detection (Phase 39). Read-only analysis over existing review
 * history — no writes, no FSRS/review/AI/sync/analytics/coverage changes.
 *
 * One aggregated query returns per-reviewed-card stats (total/fails/passes +
 * card meta); a second returns saved/known counts per JLPT. Everything else
 * (vocab/grammar lists, JLPT + frequency breakdowns, rule-based
 * recommendations) is derived in JS. Rating convention matches analytics:
 * pass = rating ≥ 3 (Good/Easy), fail = rating = 1 (Again).
 */

const MATURE_STABILITY = 21;
const MIN_REVIEWS = 3; // ignore tiny samples in "weakest" ranking
const TOP_N = 5;

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

interface CardAgg {
  id: string;
  label: string;
  cardType: string;
  jlptLevel: string | null;
  frequency: number | null;
  total: number;
  fails: number;
  passes: number;
}

function freqBand(f: number | null): string | null {
  if (f == null) return null;
  if (f <= 1000) return "Top 1k";
  if (f <= 3000) return "Top 3k";
  if (f <= 5000) return "Top 5k";
  return "5k+";
}
const FREQ_BANDS = ["Top 1k", "Top 3k", "Top 5k", "5k+"];
const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"];

export class WeakPointService {
  async getWeakPoints(userId: string) {
    const [rawAgg, savedKnown] = await Promise.all([
      db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT c.id AS "id", c.question AS "label", c."cardType" AS "cardType",
               c."jlptLevel" AS "jlptLevel", c.frequency AS "frequency",
               COUNT(rl.*) AS "total",
               COUNT(*) FILTER (WHERE rl.rating = 1) AS "fails",
               COUNT(*) FILTER (WHERE rl.rating >= 3) AS "passes"
        FROM review_logs rl
        JOIN cards c ON c.id = rl."cardId"
        JOIN decks d ON d.id = c."deckId"
        WHERE d."userId" = ${userId} AND c."deletedAt" IS NULL
        GROUP BY c.id, c.question, c."cardType", c."jlptLevel", c.frequency
      `,
      db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT c."jlptLevel" AS "jlpt",
               COUNT(*) AS "saved",
               COUNT(*) FILTER (WHERE cs.stability >= ${MATURE_STABILITY}) AS "known"
        FROM cards c
        JOIN decks d ON d.id = c."deckId"
        LEFT JOIN card_schedules cs ON cs."cardId" = c.id
        WHERE d."userId" = ${userId} AND c."deletedAt" IS NULL AND c."jlptLevel" IS NOT NULL
        GROUP BY c."jlptLevel"
      `,
    ]);

    const cards: CardAgg[] = rawAgg.map((r) => ({
      id: String(r.id),
      label: String(r.label ?? ""),
      cardType: String(r.cardType ?? "vocab"),
      jlptLevel: r.jlptLevel == null ? null : String(r.jlptLevel),
      frequency: r.frequency == null ? null : Number(r.frequency),
      total: Number(r.total),
      fails: Number(r.fails),
      passes: Number(r.passes),
    }));

    const item = (c: CardAgg) => ({
      id: c.id,
      label: c.label,
      jlptLevel: c.jlptLevel,
      total: c.total,
      fails: c.fails,
      retentionPct: pct(c.passes, c.total),
    });

    const byType = (type: string) => {
      const list = cards.filter((c) => c.cardType === type);
      const eligible = list.filter((c) => c.total >= MIN_REVIEWS);
      return {
        mostFailed: [...list].sort((a, b) => b.fails - a.fails).filter((c) => c.fails > 0).slice(0, TOP_N).map(item),
        lowestRetention: [...eligible]
          .sort((a, b) => a.passes / a.total - b.passes / b.total)
          .slice(0, TOP_N)
          .map(item),
        mostReviewed: [...list].sort((a, b) => b.total - a.total).slice(0, TOP_N).map(item),
      };
    };

    // JLPT breakdown: saved/known from savedKnown; retention/failure from reviews.
    const savedKnownMap = new Map(
      savedKnown.map((r) => [String(r.jlpt), { saved: Number(r.saved), known: Number(r.known) }])
    );
    const jlpt = JLPT_LEVELS.map((level) => {
      const rows = cards.filter((c) => c.jlptLevel === level);
      const total = rows.reduce((s, c) => s + c.total, 0);
      const fails = rows.reduce((s, c) => s + c.fails, 0);
      const passes = rows.reduce((s, c) => s + c.passes, 0);
      const sk = savedKnownMap.get(level) ?? { saved: 0, known: 0 };
      return {
        level,
        saved: sk.saved,
        known: sk.known,
        reviews: total,
        retentionPct: pct(passes, total),
        failurePct: pct(fails, total),
      };
    });

    // Frequency bands.
    const frequency = FREQ_BANDS.map((band) => {
      const rows = cards.filter((c) => freqBand(c.frequency) === band);
      const total = rows.reduce((s, c) => s + c.total, 0);
      const fails = rows.reduce((s, c) => s + c.fails, 0);
      const passes = rows.reduce((s, c) => s + c.passes, 0);
      return { band, reviews: total, retentionPct: pct(passes, total), failurePct: pct(fails, total) };
    });

    // ── Rule-based recommendations ──────────────────────────────────────────
    const weakest = <T extends { reviews: number; retentionPct: number | null }>(arr: T[]) =>
      arr.filter((x) => x.reviews >= MIN_REVIEWS && x.retentionPct != null).sort((a, b) => a.retentionPct! - b.retentionPct!)[0] ?? null;

    const weakestJlpt = weakest(jlpt);
    const weakestFrequencyBand = weakest(frequency);
    const grammar = byType("grammar");
    const weakestGrammar = grammar.mostFailed[0] ?? grammar.lowestRetention[0] ?? null;

    const topReviewTargets = [...cards]
      .filter((c) => c.total >= 1 && c.passes < c.total)
      .sort((a, b) => b.fails * 2 + (b.total - b.passes) - (a.fails * 2 + (a.total - a.passes)))
      .slice(0, 10)
      .map((c) => ({ ...item(c), cardType: c.cardType }));

    const messages: string[] = [];
    if (weakestJlpt) messages.push(`Your weakest JLPT level is ${weakestJlpt.level} (${weakestJlpt.retentionPct}% retention).`);
    if (weakestGrammar) messages.push(`You repeatedly miss ${weakestGrammar.label}.`);
    if (weakestFrequencyBand) messages.push(`Your weakest frequency band is ${weakestFrequencyBand.band} (${weakestFrequencyBand.retentionPct}% retention).`);
    const top1k = frequency.find((f) => f.band === "Top 1k");
    if (top1k && top1k.retentionPct != null) messages.push(`Retention for ${top1k.band} words is ${top1k.retentionPct}%.`);
    if (!messages.length) messages.push("Not enough review history yet — keep reviewing to surface weak points.");

    return {
      vocabulary: byType("vocab"),
      grammar,
      jlpt,
      frequency,
      recommendations: {
        weakestGrammar,
        weakestJlpt,
        weakestFrequencyBand,
        topReviewTargets,
        messages,
      },
    };
  }
}

export const weakPointService = new WeakPointService();
