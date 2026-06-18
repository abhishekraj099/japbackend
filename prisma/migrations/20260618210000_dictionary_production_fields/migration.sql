-- AlterTable
ALTER TABLE "dictionary_entries" ADD COLUMN     "commonWord" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" INTEGER,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'jmdict';

-- CreateIndex
CREATE INDEX "dictionary_entries_commonWord_frequency_idx" ON "dictionary_entries"("commonWord", "frequency");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entries_word_reading_key" ON "dictionary_entries"("word", "reading");

