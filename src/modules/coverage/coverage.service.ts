import { db } from "../../config/database.js";

/**
 * Learning Coverage Engine (Phase 35). Read-only frequency-weighted estimate of
 * how much real-world Japanese a learner can likely comprehend today, computed
 * entirely from existing data (known vocab + frequency metadata). No second
 * vocabulary system, no writes, no FSRS/review impact.
 *
 * Model (documented, estimate-only):
 *   Token coverage of a corpus is dominated by its most frequent words (Zipf).
 *   We approximate each word's token share at rank r as 1 / r^s and sum that
 *   over the learner's KNOWN words, normalised by the generalised harmonic
 *   number H(N, s) of the category's vocabulary breadth N:
 *       coverage = Σ_known (1 / rank^s)  /  Σ_{r=1..N} (1 / r^s)
 *   Categories differ by N (and a slight s tweak): anime is conversational
 *   (small high-frequency core → easier), novels have a long rare-word tail
 *   (large N → harder). `frequency` is treated as a 1-based rank (lower = more
 *   common); words without a frequency rank can't be weighted and are skipped.
 */

const MATURE_STABILITY = 21;

interface CategoryConfig {
  id: string;
  label: string;
  n: number; // vocabulary breadth (ranks that meaningfully contribute)
  s: number; // Zipf exponent
  description: string;
}

const CATEGORIES: CategoryConfig[] = [
  { id: "anime", label: "Anime", n: 8000, s: 1.0, description: "High-frequency conversational vocabulary." },
  { id: "web", label: "General Web", n: 18000, s: 1.0, description: "Mixed-frequency everyday vocabulary." },
  { id: "news", label: "News", n: 15000, s: 1.0, description: "Newspaper-frequency, more formal/kanji-heavy." },
  { id: "novels", label: "Novels", n: 25000, s: 0.95, description: "Literary vocabulary with a long rare-word tail." },
];

// Generalised harmonic denominators H(N, s), computed once at module load.
function harmonic(n: number, s: number): number {
  let sum = 0;
  for (let r = 1; r <= n; r++) sum += 1 / Math.pow(r, s);
  return sum;
}
const HN: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c.id, harmonic(c.n, c.s)]));

function band(pct: number): string {
  if (pct < 50) return "Beginner";
  if (pct < 70) return "Intermediate";
  if (pct < 85) return "Advanced";
  if (pct < 95) return "Comfortable";
  return "Near-Native Reading Coverage";
}

export class CoverageService {
  async getCoverage(userId: string) {
    const vocab = { cardType: "vocab", deck: { userId }, deletedAt: null as Date | null };
    const known = { ...vocab, schedule: { stability: { gte: MATURE_STABILITY } } };

    const [totalVocab, knownWords, knownRanksRows] = await Promise.all([
      db.card.count({ where: vocab }),
      db.card.count({ where: known }),
      // Single light query: just the frequency ranks of the user's known words.
      db.card.findMany({ where: { ...known, frequency: { not: null } }, select: { frequency: true } }),
    ]);
    const learningWords = totalVocab - knownWords;

    const ranks = knownRanksRows.map((r) => Math.max(1, r.frequency!));
    const categories = CATEGORIES.map((c) => {
      const numerator = ranks.reduce((acc, rank) => acc + 1 / Math.pow(rank, c.s), 0);
      const coveragePercent = Math.min(100, Math.round((numerator / HN[c.id]) * 100));
      return {
        id: c.id,
        label: c.label,
        coveragePercent,
        band: band(coveragePercent),
        description: c.description,
      };
    });

    return {
      vocabulary: {
        knownWords,
        learningWords,
        totalTrackedWords: knownWords + learningWords,
        rankedKnownWords: ranks.length, // known words that carry a frequency rank
      },
      categories,
    };
  }
}

export const coverageService = new CoverageService();
