/**
 * Pitch-accent overlay importer (Kanjium dataset).
 *
 * Reads backend/data/pitch/accents.txt — the Kanjium pitch-accent list in
 * `word<TAB>reading<TAB>accent` format — and stamps `pitchAccent` onto matching
 * DictionaryEntry rows WITHOUT re-importing JMdict. Mirrors the JLPT and
 * frequency overlay importers.
 *
 * Matching: word + reading (NOT word alone). Reading is required to keep
 * homographs apart — e.g. 橋/はし (②) vs 箸/はし (①), and 橋/きょう (①) vs
 * 橋/はし (②). For kana-only dictionary rows (reading IS NULL) the headword
 * itself is the reading, so COALESCE(reading, word) is compared.
 *
 * Normalization: the accent column is the mora number of the downstep, possibly
 * comma-separated or POS-tagged (e.g. "0,2", "(副)0,(名)3"). We take the first
 * integer and render it as a circled digit so it drops straight into the UI,
 * which already renders `[pitchAccent]`:
 *   0 -> ⓪   1 -> ①   2 -> ②   …   9 -> ⑨   (…up to ⑳)
 *
 * Idempotent / resume-safe: only fills rows where pitchAccent IS NULL, so a
 * re-run is a no-op for already-stamped entries.
 *
 * Usage:  npm run import:pitch
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const db = new PrismaClient({ adapter });

const FILE = path.resolve(process.cwd(), "data/pitch/accents.txt");
const CHUNK = 1000;

const esc = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Effective reading key for a (word, reading) pair: a kana headword with no
 *  separate reading is its own reading. Keeps file pairs and dictionary rows
 *  comparable. */
const readingKey = (word: string, reading: string | null) =>
  reading && reading.trim() ? reading.trim() : word;

/**
 * First mora-number in the accent field -> circled digit, or null if there is
 * no usable number. Handles "2", "0,2" and POS-tagged "(副)0,(名)3".
 */
function toCircled(accentRaw: string): string | null {
  const m = accentRaw.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  if (n === 0) return "⓪"; // U+24EA — separate from the contiguous 1..20 block
  if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
  return null; // outside the displayable circled-digit range
}

interface Pair {
  word: string;
  reading: string; // effective reading (kana headword falls back to word)
  pitch: string;   // circled digit
}

async function bulkSet(pairs: Pair[]): Promise<number> {
  let updated = 0;
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const batch = pairs.slice(i, i + CHUNK);
    const values = batch
      .map((p) => `(${esc(p.word)}, ${esc(p.reading)}, ${esc(p.pitch)})`)
      .join(",");
    const count = await db.$executeRawUnsafe(
      `UPDATE dictionary_entries AS d
         SET "pitchAccent" = v.pitch
         FROM (VALUES ${values}) AS v(word, reading, pitch)
        WHERE d."word" = v.word
          AND COALESCE(d."reading", d."word") = v.reading
          AND d."pitchAccent" IS NULL`
    );
    updated += count;
    if ((i / CHUNK) % 10 === 0)
      console.log(`  Processed ${Math.min(i + CHUNK, pairs.length)}/${pairs.length}…`);
  }
  return updated;
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`Pitch-accent list not found at: ${FILE}`);
    console.error("Download Kanjium accents.txt into data/pitch/ first (see README).");
    process.exit(1);
  }

  // ── Parse + normalize the Kanjium file ──────────────────────────────────────
  const lines = fs.readFileSync(FILE, "utf8").split(/\r?\n/);
  let processed = 0;   // valid, normalizable lines
  let skipped = 0;     // unparseable / no numeric accent
  const seen = new Set<string>();
  const pairs: Pair[] = [];

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const [word, readingRaw, accentRaw] = raw.split("\t");
    if (!word || accentRaw === undefined) { skipped++; continue; }

    const pitch = toCircled(accentRaw);
    if (!pitch) { skipped++; continue; }

    processed++;
    const reading = readingKey(word, readingRaw ?? null);
    const key = `${word}\t${reading}`;
    if (seen.has(key)) continue; // keep first occurrence for a word+reading
    seen.add(key);
    pairs.push({ word, reading, pitch });
  }

  console.log(
    `Parsed ${processed} accent rows (${skipped} skipped) -> ${pairs.length} unique word+reading pairs.`
  );

  // ── Compute matched / unmatched against the dictionary keys ──────────────────
  console.log("Loading dictionary keys…");
  const dictRows = await db.dictionaryEntry.findMany({
    select: { word: true, reading: true },
  });
  const dictKeys = new Set(dictRows.map((r) => `${r.word}\t${readingKey(r.word, r.reading)}`));

  const matchedPairs = pairs.filter((p) => dictKeys.has(`${p.word}\t${p.reading}`));
  const unmatched = pairs.length - matchedPairs.length;

  console.log(`Matched ${matchedPairs.length} pairs to the dictionary (${unmatched} unmatched). Applying…`);
  const updated = await bulkSet(matchedPairs);

  const withPitch = await db.dictionaryEntry.count({ where: { pitchAccent: { not: null } } });

  console.log("");
  console.log("── Import statistics ───────────────────────────");
  console.log(`Total rows processed:   ${processed}`);
  console.log(`Unique word+reading:    ${pairs.length}`);
  console.log(`Matched rows:           ${matchedPairs.length}`);
  console.log(`Unmatched rows:         ${unmatched}`);
  console.log(`Updated rows (set now): ${updated}`);
  console.log(`Total entries w/ pitch: ${withPitch}`);
  console.log("Completed successfully");
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("Pitch import failed:", err);
  await db.$disconnect();
  process.exit(1);
});
