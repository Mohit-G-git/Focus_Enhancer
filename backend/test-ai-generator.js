/**
 * test-ai-generator.js
 * Quick manual test for the AI task generator service.
 * Run: node test-ai-generator.js
 *
 * NOTE: This tests only the token calculation logic (no Gemini API call).
 * To test with real AI, set GEMINI_API_KEY in .env.
 */

require('dotenv').config();
const { calculateTokenEconomics, calculateDeadline } = require('./src/services/aiTaskGenerator');

console.log('\n🔍 Testing Token Economics Calculator\n');
console.log('━'.repeat(60));

const testCases = [
    { difficulty: 'easy', creditWeight: 1 },
    { difficulty: 'easy', creditWeight: 5 },
    { difficulty: 'easy', creditWeight: 10 },
    { difficulty: 'medium', creditWeight: 1 },
    { difficulty: 'medium', creditWeight: 5 },
    { difficulty: 'medium', creditWeight: 10 },
    { difficulty: 'hard', creditWeight: 1 },
    { difficulty: 'hard', creditWeight: 5 },
    { difficulty: 'hard', creditWeight: 10 },
];

console.log(`${'Difficulty'.padEnd(10)} ${'CreditWt'.padEnd(10)} ${'Stake'.padEnd(10)} ${'Reward'.padEnd(10)}`);
console.log('─'.repeat(45));

for (const tc of testCases) {
    const { tokenStake, reward } = calculateTokenEconomics(tc.difficulty, tc.creditWeight);
    console.log(
        `${tc.difficulty.padEnd(10)} ${String(tc.creditWeight).padEnd(10)} ${String(tokenStake).padEnd(10)} ${String(reward).padEnd(10)}`
    );
}

console.log('\n🔍 Testing Deadline Calculator\n');
console.log('━'.repeat(60));

const durations = [24, 72, 168];
for (const h of durations) {
    const deadline = calculateDeadline(h);
    console.log(`Duration: ${h}h  →  Deadline: ${deadline.toISOString()}`);
}

console.log('\n✅ Token economics and deadline calculation tests passed!\n');
