-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "cardType" TEXT NOT NULL DEFAULT 'vocab',
ADD COLUMN     "examples" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "patternId" TEXT;

-- CreateIndex
CREATE INDEX "cards_cardType_idx" ON "cards"("cardType");

-- CreateIndex
CREATE INDEX "cards_deckId_cardType_patternId_idx" ON "cards"("deckId", "cardType", "patternId");
