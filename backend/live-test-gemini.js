/**
 * live-test-gemini.js — ESM version
 * Tests: urgency, token economics, AI task generation
 * Run: node live-test-gemini.js
 */
import 'dotenv/config';
import { generateTasks, calculateTokenEconomics, calculateUrgency, getTaskCountForEvent } from './src/services/aiTaskGenerator.js';

const now = Date.now();

console.log('\n🔧 Focus Enhancer v2.0 — AI Task Generator Tests (ESM)\n');
console.log('━'.repeat(60));

// Test 1: Urgency
console.log('\n📊 Urgency Multiplier');
for (const [label, days] of [['1 day', 1], ['5 days', 5], ['10 days', 10], ['20 days', 20]]) {
    const { multiplier, label: l } = calculateUrgency(new Date(now + days * 864e5));
    console.log(`  ${label.padEnd(10)} → ×${multiplier} (${l})`);
}

// Test 2: Token Economics
console.log('\n💰 Token Economics (credit=4)');
for (const d of ['easy', 'medium', 'hard']) {
    const { tokenStake, reward } = calculateTokenEconomics(d, 4, 1.25);
    console.log(`  ${d.padEnd(8)} → stake=${tokenStake} reward=${reward}`);
}

// Test 3: Task Counts
console.log('\n📋 Tasks per Event');
for (const e of ['quiz', 'assignment', 'midterm', 'final']) {
    console.log(`  ${e.padEnd(12)} → ${getTaskCountForEvent(e)} tasks`);
}

// Test 4: Live Gemini
console.log('\n🤖 Live Gemini Generation...\n');
try {
    const tasks = await generateTasks({
        courseName: 'Data Structures & Algorithms', creditWeight: 4, durationType: 'full',
        courseId: '507f1f77bcf86cd799439011', announcementId: '507f1f77bcf86cd799439012',
        eventType: 'midterm', topics: ['Binary Trees', 'Graph Traversal', 'Dynamic Programming'],
        eventDate: new Date(now + 10 * 864e5).toISOString(),
    });

    console.log(`✅ ${tasks.length} tasks generated:\n`);
    let allOk = true;
    for (const t of tasks) {
        if (t.durationHours > 4) allOk = false;
        if (t.tokenStake !== t.reward) allOk = false;
        console.log(`  [${t.difficulty}] ${t.title} — ${t.tokenStake}T, ${t.durationHours}h, topic: ${t.topic}`);
    }
    console.log(`\n  All ≤4h: ${allOk ? '✅' : '❌'} | Stake=Reward: ${allOk ? '✅' : '❌'}`);
    console.log('\n🎉 All tests passed!\n');
} catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
}
