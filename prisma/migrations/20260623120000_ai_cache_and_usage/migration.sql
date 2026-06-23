-- CreateTable
CREATE TABLE "ai_dictionary_entries" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'word',
    "reading" TEXT,
    "meaning" TEXT,
    "examples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jlptLevel" TEXT,
    "pitchAccent" TEXT,
    "provider" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_dictionary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_dictionary_entries_provider_idx" ON "ai_dictionary_entries"("provider");

-- CreateIndex
CREATE INDEX "ai_dictionary_entries_hitCount_idx" ON "ai_dictionary_entries"("hitCount");

-- CreateIndex
CREATE UNIQUE INDEX "ai_dictionary_entries_normalizedQuery_kind_key" ON "ai_dictionary_entries"("normalizedQuery", "kind");

-- CreateIndex
CREATE INDEX "ai_usage_date_idx" ON "ai_usage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_userId_date_key" ON "ai_usage"("userId", "date");

