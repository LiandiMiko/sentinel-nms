CREATE TABLE "PollJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "result" TEXT,
    "error" TEXT
);

CREATE INDEX "PollJob_status_requestedAt_idx" ON "PollJob"("status", "requestedAt");
CREATE INDEX "PollJob_completedAt_idx" ON "PollJob"("completedAt");
