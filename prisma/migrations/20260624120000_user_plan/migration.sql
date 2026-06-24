-- Phase 26B — user subscription plan (drives AI quota).
CREATE TYPE "Plan" AS ENUM ('FREE', 'PREMIUM');
ALTER TABLE "users" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'FREE';
