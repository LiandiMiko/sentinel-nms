import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { processNextPollJob } from "../src/modules/scheduler/poll-job.service.js";

describe("poll worker job processing", () => {
    it("claims, polls, and completes a queued job", async () => {
        const calls = [];
        const jobs = {
            async claimNext() { calls.push("claim"); return { id: "job-1" }; },
            async complete(id, result) { calls.push(["complete", id, result.up]); },
            async fail() { assert.fail("A successful poll must not fail the job."); }
        };
        const metrics = {
            async pollAll() { calls.push("poll"); return { up: 2, down: 1 }; }
        };

        assert.equal(await processNextPollJob(jobs, metrics, { info() {}, error() {} }), true);
        assert.deepEqual(calls, ["claim", "poll", ["complete", "job-1", 2]]);
    });

    it("records a poll error as a failed job", async () => {
        const error = new Error("poll failed");
        let failedJob;
        const jobs = {
            async claimNext() { return { id: "job-2" }; },
            async complete() { assert.fail("A failed poll must not complete the job."); },
            async fail(id, failure) { failedJob = { id, failure }; }
        };

        assert.equal(await processNextPollJob(
            jobs,
            { pollAll: async () => { throw error; } },
            { info() {}, error() {} }
        ), true);
        assert.deepEqual(failedJob, { id: "job-2", failure: error });
    });

    it("does not poll when no job is available", async () => {
        let polled = false;
        const jobs = { async claimNext() { return null; } };

        assert.equal(await processNextPollJob(jobs, {
            async pollAll() { polled = true; }
        }, { info() {}, error() {} }), false);
        assert.equal(polled, false);
    });
});
