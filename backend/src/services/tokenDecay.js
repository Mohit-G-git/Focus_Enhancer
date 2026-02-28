import Task from '../models/Task.js';

/**
 * ============================================================
 *  TOKEN DECAY — Decreases stake/reward of aging tasks
 * ============================================================
 *  Runs every 3 days.
 *  Tasks older than 3 days lose token value progressively.
 *  This pushes students to attempt tasks sooner.
 *
 *  Decay formula:
 *    Each 3-day cycle reduces stake & reward by 20%.
 *    Minimum floor: 1 token (task never becomes free).
 * ============================================================
 */

const DECAY_INTERVAL_DAYS = 3;
const DECAY_RATE = 0.20; // 20% reduction per cycle
const MIN_STAKE = 1;

/**
 * Apply token decay to all tasks whose deadline hasn't passed
 * and were created more than DECAY_INTERVAL_DAYS ago.
 */
export async function runTokenDecay() {
    console.log('\n💸 Running token decay...\n');

    const cutoff = new Date(Date.now() - DECAY_INTERVAL_DAYS * 864e5);

    // Find tasks created before the cutoff that still have tokens > minimum
    const tasks = await Task.find({
        deadline: { $gte: new Date() },      // deadline not passed
        createdAt: { $lt: cutoff },          // older than 3 days
        tokenStake: { $gt: MIN_STAKE },      // still has value to decay
    });

    if (tasks.length === 0) {
        console.log('  No tasks eligible for decay.');
        return;
    }

    let decayed = 0;
    for (const task of tasks) {
        // Calculate how many 3-day cycles have passed since creation
        const ageMs = Date.now() - task.createdAt.getTime();
        const cycles = Math.floor(ageMs / (DECAY_INTERVAL_DAYS * 864e5));

        // Apply compound decay: value × (1 - rate)^cycles
        const decayFactor = Math.pow(1 - DECAY_RATE, cycles);
        const originalStake = task.generationContext?.creditWeight
            ? Math.round(task.tokenStake / decayFactor * (1 - DECAY_RATE)) // approximate original
            : task.tokenStake;

        const newStake = Math.max(MIN_STAKE, Math.round(task.tokenStake * (1 - DECAY_RATE)));
        const newReward = newStake; // stake = reward

        if (newStake < task.tokenStake) {
            task.tokenStake = newStake;
            task.reward = newReward;
            await task.save();
            decayed++;
        }
    }

    console.log(`  💸 Decayed ${decayed}/${tasks.length} tasks. Rate: -${DECAY_RATE * 100}% per ${DECAY_INTERVAL_DAYS} days\n`);
}
