import { db } from "../../config/database.js";
import type { AIWordResult, AISentenceResult } from "./ai.types.js";

type Kind = "word" | "sentence";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * AI cache + usage store (Phase 26A). Persistent (no TTL). Caches only
 * successful/validated results; never caches failures. Cache hits bump
 * hitCount/lastUsedAt and never touch usage; misses are recorded in ai_usage.
 */
export class AiCacheService {
  // ── Word cache ───────────────────────────────────────────────────────────
  async getWord(normalizedQuery: string): Promise<{ result: AIWordResult; provider: string } | null> {
    const row = await db.aiDictionaryEntry.findUnique({
      where: { normalizedQuery_kind: { normalizedQuery, kind: "word" } },
    });
    if (!row) return null;
    await this.touch(row.id);
    return {
      result: {
        reading: row.reading,
        meaning: row.meaning,
        examples: row.examples,
        jlptLevel: row.jlptLevel,
        pitchAccent: row.pitchAccent,
        category: null,
      },
      provider: row.provider,
    };
  }

  async saveWord(query: string, normalizedQuery: string, r: AIWordResult, provider: string): Promise<void> {
    await this.save(query, normalizedQuery, "word", {
      reading: r.reading,
      meaning: r.meaning,
      examples: r.examples ?? [],
      jlptLevel: r.jlptLevel,
      pitchAccent: r.pitchAccent,
      provider,
    });
  }

  // ── Sentence cache ─────────────────────────────────────────────────────────
  async getSentence(normalizedQuery: string): Promise<{ result: AISentenceResult; provider: string } | null> {
    const row = await db.aiDictionaryEntry.findUnique({
      where: { normalizedQuery_kind: { normalizedQuery, kind: "sentence" } },
    });
    if (!row) return null;
    await this.touch(row.id);
    return { result: { reading: row.reading, translation: row.meaning }, provider: row.provider };
  }

  async saveSentence(query: string, normalizedQuery: string, r: AISentenceResult, provider: string): Promise<void> {
    await this.save(query, normalizedQuery, "sentence", {
      reading: r.reading,
      meaning: r.translation, // translation stored in `meaning`
      examples: [],
      jlptLevel: null,
      pitchAccent: null,
      provider,
    });
  }

  // ── Usage (premium prep) ────────────────────────────────────────────────────
  /** Record one AI cache miss (provider call) for a user/day. No enforcement. */
  async recordUsage(userId: string): Promise<void> {
    const date = todayUtc();
    await db.aiUsage.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, requestCount: 1 },
      update: { requestCount: { increment: 1 } },
    });
  }

  // ── Admin metrics (service methods only; no routes/UI) ───────────────────────
  async totalCacheEntries(): Promise<number> {
    return db.aiDictionaryEntry.count();
  }

  /** hits / (hits + misses), where hits = Σ hitCount, misses = Σ usage. */
  async cacheHitRate(): Promise<number> {
    const [hitAgg, missAgg] = await Promise.all([
      db.aiDictionaryEntry.aggregate({ _sum: { hitCount: true } }),
      db.aiUsage.aggregate({ _sum: { requestCount: true } }),
    ]);
    const hits = hitAgg._sum.hitCount ?? 0;
    const misses = missAgg._sum.requestCount ?? 0;
    const total = hits + misses;
    return total === 0 ? 0 : hits / total;
  }

  async providerUsage(): Promise<Record<string, number>> {
    const rows = await db.aiDictionaryEntry.groupBy({ by: ["provider"], _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.provider, r._count._all]));
  }

  async topQueries(limit = 10): Promise<Array<{ query: string; kind: string; hitCount: number }>> {
    const rows = await db.aiDictionaryEntry.findMany({
      orderBy: { hitCount: "desc" },
      take: limit,
      select: { query: true, kind: true, hitCount: true },
    });
    return rows;
  }

  // ── internals ────────────────────────────────────────────────────────────
  private async touch(id: string): Promise<void> {
    await db.aiDictionaryEntry.update({
      where: { id },
      data: { hitCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  private async save(
    query: string,
    normalizedQuery: string,
    kind: Kind,
    data: {
      reading: string | null;
      meaning: string | null;
      examples: string[];
      jlptLevel: string | null;
      pitchAccent: string | null;
      provider: string;
    }
  ): Promise<void> {
    // Upsert guards against a race where two misses resolve the same key.
    await db.aiDictionaryEntry.upsert({
      where: { normalizedQuery_kind: { normalizedQuery, kind } },
      create: { query, normalizedQuery, kind, ...data },
      update: {}, // first writer wins; don't clobber an existing cached answer
    });
  }
}

export const aiCacheService = new AiCacheService();
