/**
 * Frequency overlay importer.
 *
 * Reads backend/data/frequency/frequency.txt — a frequency-ordered word list
 * where the line number IS the rank (line 1 = most frequent). Stamps that rank
 * onto matching DictionaryEntry.frequency WITHOUT re-importing JMdict.
 *
 * Matching: exact `word`. Lower number = more frequent.
 * Resume-safe: only fills rows where frequency IS NULL, so re-running is a
 * no-op for already-ranked entries and avoids duplicate updates.
 *
 * Usage:  npm run import:frequency
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const db = new PrismaClient({ adapter });

const FILE = path.resolve(process.cwd(), "data/frequency/frequency.txt");
const CHUNK = 1000;

const esc = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function bulkSet(pairs: { word: string; rank: number }[]): Promise<number> {
  let updated = 0;
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const batch = pairs.slice(i, i + CHUNK);
    const values = batch.map((p) => `(${esc(p.word)}, ${p.rank})`).join(",");
    const count = await db.$executeRawUnsafe(
      `UPDATE dictionary_entries AS d
         SET "frequency" = v.rank::int
         FROM (VALUES ${values}) AS v(word, rank)
        WHERE d."word" = v.word AND d."frequency" IS NULL`
    );
    updated += count;
    if ((i / CHUNK) % 5 === 0) console.log(`  Processed ${Math.min(i + CHUNK, pairs.length)}/${pairs.length}…`);
  }
  return updated;
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`Frequency list not found at: ${FILE}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(FILE, "utf8").split(/\r?\n/);
  const pairs: { word: string; rank: number }[] = [];
  let rank = 0;
  const seen = new Set<string>();
  for (const raw of lines) {
    const word = raw.trim();
    if (!word || word === "EOS") continue;
    rank++; // rank reflects position in the frequency-ordered list
    if (seen.has(word)) continue; // keep first (most frequent) occurrence only
    seen.add(word);
    pairs.push({ word, rank });
  }

  console.log(`Loaded ${pairs.length} ranked words. Applying to dictionary…`);
  const updated = await bulkSet(pairs);

  const ranked = await db.dictionaryEntry.count({ where: { frequency: { not: null } } });
  console.log("");
  console.log(`Frequency applied to: ${updated} entries`);
  console.log(`Total entries with a frequency rank: ${ranked}`);
  console.log("Completed successfully");
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("Frequency import failed:", err);
  await db.$disconnect();
  process.exit(1);
});
