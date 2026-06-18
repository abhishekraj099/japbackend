import { Prisma } from "@prisma/client";
import { db } from "../../config/database.js";
import type { DictionaryResult } from "./dictionary.types.js";

const MAX_RESULTS = 20;

// Common words first, then frequency rank (nulls last), then JLPT, then word.
const ORDER_BY: Prisma.DictionaryEntryOrderByWithRelationInput[] = [
  { commonWord: "desc" },
  { frequency: "asc" },
  { jlptLevel: "asc" },
  { word: "asc" },
];

const SELECT = {
  id: true,
  word: true,
  reading: true,
  meanings: true,
  jlptLevel: true,
  partOfSpeech: true,
  frequency: true,
  commonWord: true,
} satisfies Prisma.DictionaryEntrySelect;

export class DictionaryService {
  /**
   * Tiered search, stopping at the first tier that yields results:
   *   1. exact word     2. exact reading
   *   3. prefix word    4. prefix reading
   *   5. fuzzy contains (word or reading)
   * Results are capped at 20 and ordered by common/frequency/JLPT/alphabetical.
   */
  async search(query: string): Promise<DictionaryResult[]> {
    const q = query.trim();
    if (!q) return [];

    const tiers: Prisma.DictionaryEntryWhereInput[] = [
      { word: q },
      { reading: q },
      { word: { startsWith: q } },
      { reading: { startsWith: q } },
      {
        OR: [
          { word: { contains: q } },
          { reading: { contains: q } },
          { meanings: { has: q.toLowerCase() } },
        ],
      },
    ];

    for (const where of tiers) {
      const results = await db.dictionaryEntry.findMany({
        where,
        select: SELECT,
        orderBy: ORDER_BY,
        take: MAX_RESULTS,
      });
      if (results.length > 0) return results;
    }

    return [];
  }
}
