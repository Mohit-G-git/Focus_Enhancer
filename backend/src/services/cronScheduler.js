import cron from 'node-cron';
import { runWeeklyFallbackCheck, runSundayRevision } from './fallbackTaskGenerator.js';
import { runTokenDecay } from './tokenDecay.js';
import { runToleranceDecay } from './toleranceService.js';

/**
 * ============================================================
 *  CRON SCHEDULER — Automated background jobs
 * ============================================================
 *
 *  ┌──────────────────────────────────────────────────────────┐
 *  │ Job                  │ Schedule          │ What it does  │
 *  ├──────────────────────────────────────────────────────────┤
 *  │ Weekly Chapter Tasks │ Every Monday 6AM  │ Generate Mon– │
 *  │  (Path B)            │                   │ Sat tasks for │
 *  │                      │                   │ next chapter  │
 *  ├──────────────────────────────────────────────────────────┤
 *  │ Sunday Revision      │ Every Sunday 6AM  │ Spaced-rep    │
 *  │  (Path B)            │                   │ revision for  │
 *  │                      │                   │ 1 course/user │
 *  ├──────────────────────────────────────────────────────────┤
 *  │ Token Decay          │ Every 3 days      │ Decrease old  │
 *  │                      │ at midnight       │ task stakes   │
 *  └──────────────────────────────────────────────────────────┘
 *
 * ============================================================
 */

export function startCronJobs() {
    // ── Weekly Chapter Tasks: Every Monday at 6:00 AM ────────────
    // Generates 6 tasks (Mon–Sat) for the next chapter of each
    // course that has no CR activity in the last 30 days.
    cron.schedule('0 6 * * 1', async () => {
        console.log(`\n⏰ [CRON] Weekly chapter task gen — ${new Date().toISOString()}`);
        try {
            await runWeeklyFallbackCheck();
        } catch (err) {
            console.error(`❌ [CRON] Weekly chapter gen failed: ${err.message}`);
        }
    });
    console.log('  📅 Cron: Weekly chapter tasks → Every Monday 6:00 AM');

    // ── Sunday Revision: Every Sunday at 6:00 AM ─────────────────
    // For each student, picks ONE enrolled course (rotating) and
    // generates spaced-repetition revision tasks for previously
    // studied chapters. ~7 courses × 4 Sundays = each course
    // revised roughly every 1–2 weeks.
    cron.schedule('0 6 * * 0', async () => {
        console.log(`\n⏰ [CRON] Sunday revision — ${new Date().toISOString()}`);
        try {
            await runSundayRevision();
        } catch (err) {
            console.error(`❌ [CRON] Sunday revision failed: ${err.message}`);
        }
    });
    console.log('  📅 Cron: Sunday revision → Every Sunday 6:00 AM');

    // ── Token Decay: Every 3 days at midnight ────────────────────
    // Runs on days 1, 4, 7, 10, 13, 16, 19, 22, 25, 28 of each month
    cron.schedule('0 0 */3 * *', async () => {
        console.log(`\n⏰ [CRON] Token decay — ${new Date().toISOString()}`);
        try {
            await runTokenDecay();
        } catch (err) {
            console.error(`❌ [CRON] Token decay failed: ${err.message}`);
        }
    });
    console.log('  📅 Cron: Token decay → Every 3 days at midnight');

    // ── Tolerance Decay: Every day at 1:00 AM ────────────────────
    // Checks every user's absence duration vs their tolerance cap.
    // Users past their grace period lose tokens at an accelerating rate.
    cron.schedule('0 1 * * *', async () => {
        console.log(`\n⏰ [CRON] Tolerance decay — ${new Date().toISOString()}`);
        try {
            await runToleranceDecay();
        } catch (err) {
            console.error(`❌ [CRON] Tolerance decay failed: ${err.message}`);
        }
    });
    console.log('  📅 Cron: Tolerance decay → Every day 1:00 AM');

    console.log('  ✅ All cron jobs scheduled.\n');
}
