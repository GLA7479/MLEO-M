#!/usr/bin/env node
/**
 * Proof: live wall-clock mode waits until scheduledAt (not immediate batch).
 */
import { waitUntilScheduled, isImmediateExecutionMode, assertLiveNotCompressed } from "../lib/wallClock.mjs";

async function main() {
  let compressedBlocked = false;
  try {
    assertLiveNotCompressed("live", true);
  } catch {
    compressedBlocked = true;
  }

  const immediate = isImmediateExecutionMode({ dryRun: false, mode: "live", compressed: false });
  const scheduledAt = new Date(Date.now() + 2000).toISOString();
  const t0 = Date.now();
  const wait = await waitUntilScheduled(scheduledAt, { immediate: false });
  const elapsed = Date.now() - t0;

  const immediateRun = await waitUntilScheduled(scheduledAt, { immediate: true });
  const immediateElapsed = immediateRun.waitedMs;

  const ok = elapsed >= 1800 && wait.waitedMs >= 1800 && immediateElapsed === 0 && compressedBlocked;

  console.log(
    JSON.stringify(
      {
        ok,
        proof: "live mode waits until scheduledAt",
        elapsedMs: elapsed,
        reportedWaitedMs: wait.waitedMs,
        immediateModeWaitedMs: immediateElapsed,
        compressedLiveBlocked: compressedBlocked,
        outsideWindow: wait.outsideWindow,
      },
      null,
      2
    )
  );
  process.exit(ok ? 0 : 1);
}

main();
