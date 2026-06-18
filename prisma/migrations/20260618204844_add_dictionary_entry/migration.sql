-- CreateTable
CREATE TABLE "dictionary_entries" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "reading" TEXT,
    "meanings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jlptLevel" TEXT,
    "partOfSpeech" TEXT,
    "frequency" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dictionary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dictionary_entries_word_idx" ON "dictionary_entries"("word");

-- CreateIndex
CREATE INDEX "dictionary_entries_reading_idx" ON "dictionary_entries"("reading");

-- CreateIndex
CREATE INDEX "dictionary_entries_jlptLevel_idx" ON "dictionary_entries"("jlptLevel");
