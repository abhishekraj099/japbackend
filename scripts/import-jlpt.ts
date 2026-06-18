/**
 * JLPT overlay importer.
 *
 * Reads backend/data/jlpt/N5.csv … N1.csv (open-anki-jlpt-decks format:
 * `expression,reading,meaning,tags,guid`) and stamps `jlptLevel` onto matching
 * DictionaryEntry rows WITHOUT re-importing JMdict.
 *
 * Matching: exact `word` first, then `reading` fallback.
 * Order N5 → N1, only filling rows whose jlptLevel IS NULL, so a word that
 * appears in multiple levels keeps its EASIEST (lowest) level. This makes the
 * importer idempotent / resume-safe and avoids duplicate updates.
 *
 * Usage:  npm run import:jlpt
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const db = new PrismaClient({ adapter });

const DATA_DIR = path.resolve(process.cwd(), "data/jlpt");
const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
const CHUNK = 1000;

const esc = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Minimal CSV line splitter that respects double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(file: string): { word: string; reading: string }[] {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const rows: { word: string; reading: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCsvLine(line);
    const word = (cols[0] ?? "").trim();
    const reading = (cols[1] ?? "").trim();
    if (word) rows.push({ word, reading });
  }
  return rows;
}

async function bulkSet(
  matchColumn: "word" | "reading",
  pairs: { key: string; level: string }[]
): Promise<number> {
  let updated = 0;
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const batch = pairs.slice(i, i + CHUNK);
    const values = batch.map((p) => `(${esc(p.key)}, ${esc(p.level)})`).join(",");
    const count = await db.$executeRawUnsafe(
      `UPDATE dictionary_entries AS d
         SET "jlptLevel" = v.level
         FROM (VALUES ${values}) AS v(key, level)
        WHERE d."${matchColumn}" = v.key AND d."jlptLevel" IS NULL`
    );
    updated += count;
  }
  return updated;
}

async function main() {
  let totalByWord = 0;
  let totalByReading = 0;

  for (const level of LEVELS) {
    const file = path.join(DATA_DIR, `${level}.csv`);
    if (!fs.existsSync(file)) {
      console.warn(`  Skipping ${level}: file not found (${file})`);
      continue;
    }
    const rows = parseCsv(file);
    console.log(`${level}: ${rows.length} words from CSV`);

    // Pass 1: match by word
    const byWord = rows
      .filter((r) => r.word)
      .map((r) => ({ key: r.word, level }));
    const w = await bulkSet("word", byWord);

    // Pass 2: match remaining (still-null) rows by reading
    const byReading = rows
      .filter((r) => r.reading)
      .map((r) => ({ key: r.reading, level }));
    const r = await bulkSet("reading", byReading);

    totalByWord += w;
    totalByReading += r;
    console.log(`  ${level}: matched ${w} by word, ${r} by reading`);
  }

  const tagged = await db.dictionaryEntry.count({ where: { jlptLevel: { not: null } } });
  console.log("");
  console.log(`JLPT tagged by word: ${totalByWord}`);
  console.log(`JLPT tagged by reading fallback: ${totalByReading}`);
  console.log(`Total entries with a JLPT level: ${tagged}`);
  console.log("Completed successfully");
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("JLPT import failed:", err);
  await db.$disconnect();
  process.exit(1);
});
