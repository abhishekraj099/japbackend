-- Phase 25I.3 — synthetic provider health checks.
CREATE TABLE "provider_health_checks" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "healthy" BOOLEAN NOT NULL,
    "checksPassed" INTEGER NOT NULL,
    "checksFailed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_health_checks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "provider_health_checks_provider_createdAt_idx" ON "provider_health_checks"("provider", "createdAt");
