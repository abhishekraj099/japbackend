import { db } from "../../config/database.js";
import type { DictionaryResult } from "./dictionary.types.js";

const MAX_RESULTS = 20;

export class DictionaryService {
  /**
   * Search by exact word/reading first; if nothing matches, fall back to a
   * prefix search. Results capped at 20, ordered by frequency (most common first).
   */
  async search(query: string): Promise<DictionaryResult[]> {
    const q = query.trim();
    if (!q) return [];

    const exact = await db.dictionaryEntry.findMany({
      where: {
        OR: [{ word: q }, { reading: q }],
      },
      take: MAX_RESULTS,
      orderBy: [{ frequency: "asc" }],
    });

    if (exact.length > 0) return exact;

    const prefix = await db.dictionaryEntry.findMany({
      where: {
        OR: [
          { word: { startsWith: q } },
          { reading: { startsWith: q } },
        ],
      },
      take: MAX_RESULTS,
      orderBy: [{ frequency: "asc" }],
    });

    return prefix;
  }
}
