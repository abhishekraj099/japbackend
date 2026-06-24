-- Phase 25I.2 — pre-aggregated provider telemetry (no PII, no user link).
CREATE TABLE "telemetry_daily" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telemetry_daily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "telemetry_daily_date_platform_event_key" ON "telemetry_daily"("date", "platform", "event");
CREATE INDEX "telemetry_daily_date_idx" ON "telemetry_daily"("date");
