-- Phase 28.2 — soft-delete tombstones on decks + cards.
ALTER TABLE "decks" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "cards" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "decks_deletedAt_idx" ON "decks"("deletedAt");
CREATE INDEX "cards_deletedAt_idx" ON "cards"("deletedAt");
