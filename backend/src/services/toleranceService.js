import User from '../models/User.js';
import TokenLedger from '../models/TokenLedger.js';

/**
 * ============================================================
 *  TOLERANCE SERVICE — Absence protection with streak scaling
 * ============================================================
 *
 *  Core idea:
 *    Every student gets a "tolerance buffer" — a number of grace
 *    days they can be absent without losing tokens.  A longer
 *    streak earns a larger buffer.  Once the buffer is exhausted,
 *    tokens bleed at an accelerating rate.
 *
 *  ── Tolerance Cap (from longest streak) ─────────────────────
 *
 *    T_max(s) = ⌊ 2 + ln(1 + s) × 3 ⌋
 *
 *    s = 0  → 2 days  (everyone gets a base grace period)
 *    s = 3  → 6 days
 *    s = 7  → 8 days
 *    s = 14 → 10 days
 *    s = 30 → 12 days
 *
 *    Logarithmic: early streaks matter most, diminishing returns
 *    after ~30 days.  Minimum cap is always 2.
 *
 *  ── Token Bleed (after tolerance exhausted) ─────────────────
 *
 *    bleed(d_over) = ⌈ α × d_over^1.5 ⌉     (α = 2)
 *
 *    d_over = 1 →  2 tokens
 *    d_over = 2 →  6 tokens
 *    d_over = 3 → 11 tokens
 *    d_over = 5 → 23 tokens
 *
 *    Super-linear: gentle at first, punishing if neglected.
 *
 *  ── Daily Cron ──────────────────────────────────────────────
 *
 *    For each user:
 *      1. daysAbsent = ⌊(now − lastActiveDate) / 86 400 000⌋
 *      2. cap = computeToleranceCap(longestStreak)
 *      3. if daysAbsent ≤ cap → skip
 *      4. if already penalised today → skip
 *      5. daysOver = daysAbsent − cap
 *      6. bleed = min(computeBleed(daysOver), tokenBalance)
 *      7. Deduct, log, recalculate reputation.
 *
 * ============================================================
 */

// ── Constants ──────────────────────────────────────────────────
const BASE_TOLERANCE = 2;       // grace days at streak 0
const LN_SCALE      = 3;       // multiplier on the ln term
const BLEED_ALPHA   = 2;       // bleed coefficient
const BLEED_EXPONENT = 1.5;    // super-linear exponent

// ── Pure Functions (exported for testing) ──────────────────────

/**
 * Compute the tolerance cap (max grace days) from a user's
 * longest streak.
 *
 *   T_max(s) = ⌊ BASE + ln(1 + s) × SCALE ⌋
 *
 * @param  {number} longestStreak – the user's all-time best streak
 * @return {number} integer grace days (≥ BASE_TOLERANCE)
 */
export function computeToleranceCap(longestStreak) {
    const s = Math.max(0, longestStreak || 0);
    return Math.floor(BASE_TOLERANCE + Math.log(1 + s) * LN_SCALE);
}

/**
 * Compute the token bleed for a given number of days past tolerance.
 *
 *   bleed(d) = ⌈ α × d^1.5 ⌉
 *
 * @param  {number} daysOver – days past tolerance (must be > 0)
 * @return {number} tokens to deduct (≥ 0)
 */
export function computeBleed(daysOver) {
    if (daysOver <= 0) return 0;
    return Math.ceil(BLEED_ALPHA * Math.pow(daysOver, BLEED_EXPONENT));
}

/**
 * Build a tolerance status snapshot for API responses.
 *
 * @param  {object} user – Mongoose user document
 * @param  {Date}   [now] – override for testing
 * @return {object} status object
 */
export function computeToleranceStatus(user, now = new Date()) {
    const lastActive = user.streak?.lastActiveDate;
    if (!lastActive) {
        const cap = computeToleranceCap(0);
        return {
            toleranceCap: cap,
            toleranceRemaining: cap,
            daysAbsent: 0,
            daysUntilBleed: cap,
            currentBleedRate: 0,
            nextBleedRate: computeBleed(1),
            totalBled: user.tolerance?.tokensLostToDecay || 0,
            streakBonus: 0,
        };
    }

    const lastDate = new Date(lastActive);
    lastDate.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const daysAbsent = Math.max(0, Math.floor((today - lastDate) / 864e5));
    const longestStreak = user.streak?.longestStreak || 0;
    const cap = computeToleranceCap(longestStreak);
    const remaining = Math.max(0, cap - daysAbsent);
    const daysOver = Math.max(0, daysAbsent - cap);

    return {
        toleranceCap: cap,
        toleranceRemaining: remaining,
        daysAbsent,
        daysUntilBleed: remaining,
        currentBleedRate: daysOver > 0 ? computeBleed(daysOver) : 0,
        nextBleedRate: computeBleed(daysOver + 1),
        totalBled: user.tolerance?.tokensLostToDecay || 0,
        streakBonus: cap - BASE_TOLERANCE,
    };
}

/**
 * Apply tolerance penalty to a single user if applicable.
 * Mutates the user document (caller must save).
 *
 * @param  {object} user – Mongoose user document
 * @param  {Date}   [now] – override for testing
 * @return {number} actual tokens deducted (0 if no penalty)
 */
export function applyTolerancePenalty(user, now = new Date()) {
    const lastActive = user.streak?.lastActiveDate;
    if (!lastActive) return 0;                       // never logged in

    const lastDate = new Date(lastActive);
    lastDate.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const daysAbsent = Math.floor((today - lastDate) / 864e5);
    const cap = computeToleranceCap(user.streak?.longestStreak || 0);

    if (daysAbsent <= cap) return 0;                 // still within grace

    // Already penalised today?
    if (user.tolerance?.lastPenaltyDate) {
        const lastPenalty = new Date(user.tolerance.lastPenaltyDate);
        lastPenalty.setHours(0, 0, 0, 0);
        if (lastPenalty.getTime() === today.getTime()) return 0;
    }

    const daysOver = daysAbsent - cap;
    const bleed = computeBleed(daysOver);
    const actual = Math.min(bleed, user.tokenBalance || 0);

    if (actual <= 0) return 0;                       // nothing to take

    // Mutate user
    user.tokenBalance -= actual;
    if (!user.tolerance) user.tolerance = {};
    user.tolerance.lastPenaltyDate = today;
    user.tolerance.tokensLostToDecay = (user.tolerance.tokensLostToDecay || 0) + actual;
    user.stats.tokensLost = (user.stats.tokensLost || 0) + actual;
    user.recalculateReputation();

    return actual;
}

/**
 * Daily cron: iterate all users and apply tolerance penalties.
 */
export async function runToleranceDecay(nowOverride) {
    const now = nowOverride || new Date();
    console.log('\n🛡️  Running tolerance decay...\n');

    // Only process users who have logged in at least once
    const users = await User.find({
        'streak.lastActiveDate': { $ne: null },
        tokenBalance: { $gt: 0 },
    });

    if (users.length === 0) {
        console.log('  No users eligible for tolerance check.');
        return { processed: 0, penalised: 0, totalBled: 0 };
    }

    let penalised = 0;
    let totalBled = 0;

    for (const user of users) {
        const bled = applyTolerancePenalty(user, now);
        if (bled > 0) {
            await TokenLedger.create({
                userId: user._id,
                type: 'tolerance_bleed',
                amount: -bled,
                balanceAfter: user.tokenBalance,
                note: `Tolerance exhausted — absent ${Math.floor((now - new Date(user.streak.lastActiveDate)) / 864e5)} days, bled ${bled} tokens`,
            });
            await user.save();
            penalised++;
            totalBled += bled;
        }
    }

    console.log(`  🛡️  Tolerance: ${penalised}/${users.length} users penalised, ${totalBled} tokens bled\n`);
    return { processed: users.length, penalised, totalBled };
}
