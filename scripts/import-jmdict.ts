/**
 * JMdict importer — pipeline scaffold.
 *
 * This script is intentionally decoupled from any specific dataset format.
 * The flow is: SOURCE → parse → NormalizedEntry[] → bulk upsert.
 *
 * For now it ships with a small built-in SAMPLE_ENTRIES set so the dictionary
 * API can be tested end-to-end. To import the real JMdict later, implement
 * `parseJmdict()` to read the downloaded JMdict file and return NormalizedEntry[].
 * The rest of the pipeline (chunked insert, dedupe) stays unchanged.
 *
 * Usage:
 *   npx tsx scripts/import-jmdict.ts            # imports SAMPLE_ENTRIES
 *   npx tsx scripts/import-jmdict.ts --file x   # (future) import from a file
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { NormalizedEntry } from "../src/modules/dictionary/dictionary.types.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const CHUNK_SIZE = 500;

// ── Sample data (replace with real JMdict parse later) ───────────────────────
const SAMPLE_ENTRIES: NormalizedEntry[] = [
  { word: "犬", reading: "いぬ", meanings: ["dog"], jlptLevel: "N5", partOfSpeech: "noun", frequency: 124 },
  { word: "猫", reading: "ねこ", meanings: ["cat"], jlptLevel: "N5", partOfSpeech: "noun", frequency: 198 },
  { word: "水", reading: "みず", meanings: ["water"], jlptLevel: "N5", partOfSpeech: "noun", frequency: 87 },
  { word: "食べる", reading: "たべる", meanings: ["to eat"], jlptLevel: "N5", partOfSpeech: "ichidan verb", frequency: 65 },
  { word: "学校", reading: "がっこう", meanings: ["school"], jlptLevel: "N5", partOfSpeech: "noun", frequency: 142 },
  { word: "勉強", reading: "べんきょう", meanings: ["study", "diligence"], jlptLevel: "N5", partOfSpeech: "noun, suru verb", frequency: 210 },
  { word: "約束", reading: "やくそく", meanings: ["promise", "appointment", "arrangement"], jlptLevel: "N4", partOfSpeech: "noun, suru verb", frequency: 540 },
  { word: "経験", reading: "けいけん", meanings: ["experience"], jlptLevel: "N4", partOfSpeech: "noun, suru verb", frequency: 380 },
  { word: "成長", reading: "せいちょう", meanings: ["growth", "development"], jlptLevel: "N3", partOfSpeech: "noun, suru verb", frequency: 610 },
  { word: "影響", reading: "えいきょう", meanings: ["influence", "effect"], jlptLevel: "N3", partOfSpeech: "noun, suru verb", frequency: 295 },
  { word: "改善", reading: "かいぜん", meanings: ["improvement", "betterment"], jlptLevel: "N2", partOfSpeech: "noun, suru verb", frequency: 720 },
  { word: "傾向", reading: "けいこう", meanings: ["tendency", "trend", "inclination"], jlptLevel: "N2", partOfSpeech: "noun", frequency: 880 },
  { word: "曖昧", reading: "あいまい", meanings: ["vague", "ambiguous", "unclear"], jlptLevel: "N1", partOfSpeech: "na-adjective", frequency: 1320 },
  { word: "顕著", reading: "けんちょ", meanings: ["remarkable", "striking", "conspicuous"], jlptLevel: "N1", partOfSpeech: "na-adjective", frequency: 2100 },
];

/**
 * Future: parse the real JMdict dataset into NormalizedEntry[].
 * Not implemented yet — datasets are not downloaded automatically.
 */
export function parseJmdict(_filePath: string): NormalizedEntry[] {
  throw new Error(
    "parseJmdict() not implemented yet. Download JMdict and implement parsing here."
  );
}

async function importEntries(entries: NormalizedEntry[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const result = await db.dictionaryEntry.createMany({
      data: chunk.map((e) => ({
        word: e.word,
        reading: e.reading ?? null,
        meanings: e.meanings,
        jlptLevel: e.jlptLevel ?? null,
        partOfSpeech: e.partOfSpeech ?? null,
        frequency: e.frequency ?? null,
      })),
    });
    inserted += result.count;
    console.log(`  Imported ${inserted}/${entries.length}…`);
  }
  return inserted;
}

async function main() {
  const fileArg = process.argv.indexOf("--file");
  const entries =
    fileArg !== -1 ? parseJmdict(process.argv[fileArg + 1]) : SAMPLE_ENTRIES;

  console.log(`Starting dictionary import (${entries.length} entries)…`);
  const count = await importEntries(entries);
  console.log(`✅ Done. Imported ${count} dictionary entries.`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("Import failed:", err);
  await db.$disconnect();
  process.exit(1);
});
