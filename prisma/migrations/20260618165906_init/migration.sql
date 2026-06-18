/*
  Warnings:

  - You are about to drop the column `difficulty` on the `cards` table. All the data in the column will be lost.
  - You are about to drop the column `easeFactor` on the `cards` table. All the data in the column will be lost.
  - You are about to drop the column `interval` on the `cards` table. All the data in the column will be lost.
  - You are about to drop the column `nextReviewAt` on the `cards` table. All the data in the column will be lost.
  - You are about to drop the column `repetitions` on the `cards` table. All the data in the column will be lost.
  - You are about to drop the column `reviewCount` on the `cards` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `reviews` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `passwordHash` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_cardId_fkey";

-- DropIndex
DROP INDEX "cards_nextReviewAt_idx";

-- AlterTable
ALTER TABLE "cards" DROP COLUMN "difficulty",
DROP COLUMN "easeFactor",
DROP COLUMN "interval",
DROP COLUMN "nextReviewAt",
DROP COLUMN "repetitions",
DROP COLUMN "reviewCount",
ADD COLUMN     "contextSentence" TEXT,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password",
ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- DropTable
DROP TABLE "reviews";

-- CreateTable
CREATE TABLE "card_schedules" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewAt" TIMESTAMP(3),
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_schedules_cardId_key" ON "card_schedules"("cardId");

-- CreateIndex
CREATE INDEX "card_schedules_dueDate_idx" ON "card_schedules"("dueDate");

-- CreateIndex
CREATE INDEX "card_schedules_cardId_idx" ON "card_schedules"("cardId");

-- CreateIndex
CREATE INDEX "review_logs_cardId_idx" ON "review_logs"("cardId");

-- CreateIndex
CREATE INDEX "review_logs_reviewedAt_idx" ON "review_logs"("reviewedAt");

-- CreateIndex
CREATE INDEX "review_logs_createdAt_idx" ON "review_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "card_schedules" ADD CONSTRAINT "card_schedules_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
