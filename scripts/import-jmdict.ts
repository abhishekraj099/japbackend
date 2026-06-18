/**
 * Production JMdict importer (jmdict-simplified JSON format).
 *
 * Pipeline:  file -> parse words[] -> normalize -> merge(word+reading)
 *            -> batched chunked upsert (skipDuplicates) -> progress logging
 *
 * Design notes (see Phase 10 / Section 11):
 *  - Stores ONLY the fields the app uses; raw XML/editor metadata is stripped.
 *  - Merges entries sharing the same word+reading so meanings aren't duplicated
 *    across rows.
 *  - Derives `commonWord` from JMdict priority flags; `frequency`/`jlptLevel`
 *    are left null and intended to be filled by future overlay imports
 *    (frequency lists, JLPT lists) WITHOUT a full re-import.
 *  - Resume-safe: a unique (word,reading) constraint + createMany skipDuplicates
 *    means re-running continues where it left off instead of erroring.
 *
 * Usage:
 *   npm run import:jmdict            # common entries only (~22k) - default
 *   npm run import:jmdict -- --full  # full dataset (~217k)
 *   npm run import:jmdict -- --fresh # wipe jmdict rows first, then import
 *   npm run import:jmdict -- --file path/to/jmdict-eng.json
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const db = new PrismaClient({ adapter });

const CHUNK_SIZE = 1000;
const DEFAULT_FILE = path.resolve(process.cwd(), "data/jmdict-eng.json");

// ── JMdict-simplified types (only what we read) ──────────────────────────────
interface JmdictKanji { common: boolean; text: string }
interface JmdictKana { common: boolean; text: string }
interface JmdictGloss { lang: string; text: string }
interface JmdictSense { partOfSpeech: string[]; gloss: JmdictGloss[] }
interface JmdictWord {
  kanji: JmdictKanji[];
  kana: JmdictKana[];
  sense: JmdictSense[];
}

interface Row {
  word: string;
  reading: string | null;
  meanings: string[];
  partOfSpeech: string | null;
  commonWord: boolean;
}

// POS abbreviation -> readable label (most frequent ones; falls back to raw).
const POS_LABELS: Record<string, string> = {
  n: "noun", "n-pref": "noun (prefix)", "n-suf": "noun (suffix)",
  pn: "pronoun", "adj-i": "i-adjective",
  "adj-na": "na-adjective", "adj-no": "no-adjective", adv: "adverb",
  vs: "suru verb", vt: "transitive verb", vi: "intransitive verb",
  v1: "ichidan verb", v5r: "godan verb", v5s: "godan verb",
  v5k: "godan verb", v5u: "godan verb", v5g: "godan verb", v5b: "godan verb",
  v5m: "godan verb", v5n: "godan verb", v5t: "godan verb",
  exp: "expression", int: "interjection", conj: "conjunction",
  prt: "particle", aux: "auxiliary", "aux-v": "auxiliary verb",
  ctr: "counter", pref: "prefix", suf: "suffix",
};

function labelPos(codes: string[]): string | null {
  if (!codes || codes.length === 0) return null;
  const labels = codes.map((c) => POS_LABELS[c] ?? c);
  return [...new Set(labels)].join(", ");
}

function normalize(w: JmdictWord): Row | null {
  const commonWord =
    w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);

  // word = primary kanji form, or kana when there is no kanji (kana-only entry)
  const word = w.kanji[0]?.text ?? w.kana[0]?.text;
  if (!word) return null;

  // reading = primary kana; null when the headword is itself kana
  const reading = w.kanji.length > 0 ? (w.kana[0]?.text ?? null) : null;

  const meanings = [
    ...new Set(
      w.sense.flatMap((s) =>
        s.gloss.filter((g) => g.lang === "eng").map((g) => g.text)
      )
    ),
  ];
  if (meanings.length === 0) return null;

  const partOfSpeech = labelPos(w.sense[0]?.partOfSpeech ?? []);

  return { word, reading, meanings, partOfSpeech, commonWord };
}

async function insertChunk(rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await db.dictionaryEntry.createMany({
    data: rows.map((r) => ({
      word: r.word,
      reading: r.reading,
      meanings: r.meanings,
      partOfSpeech: r.partOfSpeech,
      commonWord: r.commonWord,
      source: "jmdict",
    })),
    skipDuplicates: true,
  });
  return result.count;
}

async function main() {
  const argv = process.argv.slice(2);
  const full = argv.includes("--full");
  const fresh = argv.includes("--fresh");
  const fileIdx = argv.indexOf("--file");
  const file = fileIdx !== -1 ? argv[fileIdx + 1] : DEFAULT_FILE;

  if (!fs.existsSync(file)) {
    console.error(`Dataset not found at: ${file}`);
    console.error("Download it first (see README) or pass --file <path>.");
    process.exit(1);
  }

  if (fresh) {
    console.log("Wiping existing jmdict entries...");
    const del = await db.dictionaryEntry.deleteMany({ where: { source: "jmdict" } });
    console.log(`  Removed ${del.count} rows.`);
  }

  console.log(`Importing from ${file} (${full ? "FULL" : "common-only"})...`);

  // Merge map keyed by word+reading so duplicate rows are collapsed and their
  // meanings combined before we ever touch the database.
  const merged = new Map<string, Row>();
  let seen = 0;
  let skippedNonCommon = 0;

  console.log("Reading dataset into memory...");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { words: JmdictWord[] };

  for (const value of data.words) {
    seen++;
    const row = normalize(value);
    if (!row) continue;
    if (!full && !row.commonWord) { skippedNonCommon++; continue; }

    const key = `${row.word} ${row.reading ?? ""}`;
    const existing = merged.get(key);
    if (existing) {
      existing.meanings = [...new Set([...existing.meanings, ...row.meanings])];
      existing.commonWord = existing.commonWord || row.commonWord;
    } else {
      merged.set(key, row);
    }

    if (seen % 50000 === 0) console.log(`  Parsed ${seen} entries...`);
  }

  console.log(`Parsed ${seen} entries -> ${merged.size} unique rows to import.`);

  // Chunked batch insert
  const rows = [...merged.values()];
  let inserted = 0;
  let dupes = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const count = await insertChunk(chunk);
    inserted += count;
    dupes += chunk.length - count;
    console.log(`  Imported ${inserted}/${rows.length}...`);
  }

  console.log("");
  console.log(`Imported: ${inserted} entries`);
  console.log(`Skipped duplicates: ${dupes}`);
  if (!full) console.log(`Skipped non-common: ${skippedNonCommon}`);
  console.log("Completed successfully");
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("Import failed:", err);
  await db.$disconnect();
  process.exit(1);
});
