ALTER TABLE "PollJob" ADD COLUMN "nextAttemptAt" DATETIME;
ALTER TABLE "PollJob" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PollJob" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;

CREATE INDEX "PollJob_status_nextAttemptAt_idx" ON "PollJob"("status", "nextAttemptAt");
