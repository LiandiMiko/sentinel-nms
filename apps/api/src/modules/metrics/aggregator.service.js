// Aggregator service to run hourly metric aggregation and raw data pruning

import cron from "node-cron";
import { runAggregation } from "../../../scripts/aggregateMetrics.js";
import env from "../core/config/env.js"; // ensure env has needed values

/**
 * Starts a cron job that runs the aggregation script every hour.
 * The retention period and bucket size can be configured via environment variables:
 *   AGGREGATE_BUCKET_HOURS (default 1)
 *   METRIC_RETENTION_HOURS (default 48)
 */
export function startMetricAggregator() {
  const bucketHours = Number(env.AGGREGATE_BUCKET_HOURS) || 1;
  const retentionHours = Number(env.METRIC_RETENTION_HOURS) || 48;

  // Schedule at minute 5 of every hour to avoid exact top‑of‑hour race conditions
  cron.schedule("5 * * * *", () => {
    console.info(`[Aggregator] Triggered at ${new Date().toISOString()}`);
    runAggregation({ bucketHours, retentionHours }).catch((err) => {
      console.error("[Aggregator] Unexpected error:", err);
    });
  });

  console.info(`[Aggregator] Started – bucketHours=${bucketHours}, retentionHours=${retentionHours}`);
}
