-- Phase 21A/21B — DB-level dedup + review idempotency.

-- Drop the old non-unique composite index (replaced by a unique constraint).
DROP INDEX IF EXISTS "cards_deckId_cardType_patternId_idx";

-- Review idempotency key.
ALTER TABLE "review_logs" ADD COLUMN "clientReviewId" TEXT;

-- ── Dedup existing data so the new unique indexes can be created ──────────────
-- Keep the earliest row per key (createdAt, then id as a stable tiebreaker);
-- dependent schedules / review logs are removed via ON DELETE CASCADE.
DELETE FROM "cards" a
USING "cards" b
WHERE a."deckId" = b."deckId"
  AND a."cardType" = b."cardType"
  AND a."question" = b."question"
  AND (a."createdAt" > b."createdAt"
       OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

DELETE FROM "cards" a
USING "cards" b
WHERE a."deckId" = b."deckId"
  AND a."cardType" = b."cardType"
  AND a."patternId" = b."patternId"
  AND a."patternId" IS NOT NULL
  AND (a."createdAt" > b."createdAt"
       OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- ── New indexes / constraints ────────────────────────────────────────────────
CREATE INDEX "cards_updatedAt_idx" ON "cards"("updatedAt");
CREATE UNIQUE INDEX "cards_deckId_cardType_question_key" ON "cards"("deckId", "cardType", "question");
CREATE UNIQUE INDEX "cards_deckId_cardType_patternId_key" ON "cards"("deckId", "cardType", "patternId");
CREATE UNIQUE INDEX "review_logs_clientReviewId_key" ON "review_logs"("clientReviewId");
