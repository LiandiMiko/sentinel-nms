// Aggregate raw metric data into hourly buckets and prune old raw records

import prisma from "../src/core/database/prisma.js";
import { subHours, startOfHour } from "date-fns";

/**
 * Aggregates metrics for the previous hour into the AggregatedMetric table.
 * After aggregation, raw Metric rows older than `retentionHours` are deleted.
 *
 * @param {Object} options
 * @param {number} options.bucketHours - Number of hours per bucket (default 1).
 * @param {number} options.retentionHours - How many hours of raw data to keep (default 48).
 */
async function runAggregation({ bucketHours = 1, retentionHours = 48 } = {}) {
  const now = new Date();
  const bucketEnd = startOfHour(subHours(now, bucketHours)); // end of the bucket (exclusive)
  const bucketStart = subHours(bucketEnd, bucketHours);

  // Aggregate raw metrics for the bucket
  const rows = await prisma.$queryRaw`
    SELECT "deviceId", "name",
      AVG(CAST("value" AS DOUBLE PRECISION)) AS "avgValue",
      MIN(CAST("value" AS DOUBLE PRECISION)) AS "minValue",
      MAX(CAST("value" AS DOUBLE PRECISION)) AS "maxValue",
      COUNT(*) AS "count"
    FROM "Metric"
    WHERE "createdAt" >= ${bucketStart} AND "createdAt" < ${bucketEnd}
    GROUP BY "deviceId", "name`
  ;

  // Insert aggregated rows
  for (const r of rows) {
    await prisma.aggregatedMetric.create({
      data: {
        deviceId: r.deviceId,
        name: r.name,
        bucketStart,
        avgValue: Number(r.avgValue),
        minValue: Number(r.minValue),
        maxValue: Number(r.maxValue),
        count: Number(r.count),
      },
    });
  }

  // Prune raw metrics older than the retention window
  const pruneBefore = subHours(now, retentionHours);
  await prisma.metric.deleteMany({
    where: {
      createdAt: { lte: pruneBefore },
    },
  });

  console.info(
    `[Aggregator] Completed bucket ${bucketStart.toISOString()} – ${bucketEnd.toISOString()}, ` +
      `${rows.length} aggregated rows, raw data pruned before ${pruneBefore.toISOString()}`
  );
}

// If executed directly, run once
if (import.meta.url === `file://${process.argv[1]}`) {
  runAggregation().catch((err) => {
    console.error("[Aggregator] Error:", err);
    process.exit(1);
  });
}

export default { runAggregation };
