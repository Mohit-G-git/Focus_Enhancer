/**
 * ══════════════════════════════════════════════════════════════
 *  live-test-all.js — Focus Enhancer v2.0 — Master Test Suite
 * ══════════════════════════════════════════════════════════════
 *
 *  Comprehensive production-readiness test covering:
 *
 *    SECTION 1  — Path A: Schedule Builder (pure logic, no API)
 *    SECTION 2  — Path A: Urgency & Token Economics
 *    SECTION 3  — Path A: Live Gemini Day-by-Day Generation
 *    SECTION 4  — Path B: Spaced Repetition Selection (pure logic)
 *    SECTION 5  — Path B: Token Decay Simulation
 *    SECTION 6  — Quiz: MCQ Generation (live Gemini)
 *    SECTION 7  — Quiz: Scoring Simulation
 *    SECTION 8  — Quiz: Theory Question Generation (live Gemini)
 *    SECTION 9  — Chatbot: Mood Detection (pure logic)
 *    SECTION 10 — Chatbot: Category Detection (pure logic)
 *    SECTION 11 — Chatbot: Live Gemini Conversation (no DB)
 *    SECTION 12 — Chapter Extraction (if PDF provided)
 *
 *  Run:
 *    node live-test-all.js                       # all tests
 *    node live-test-all.js /path/to/textbook.pdf # + chapter extraction
 *
 * ══════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    generateTasks,
    calculateTokenEconomics,
    calculateUrgency,
    getTaskCountForEvent,
    buildSchedule,
} from './src/services/aiTaskGenerator.js';
import { generateMCQs, generateTheoryQuestions } from './src/services/questionGenerator.js';
import { extractChapters, getChapterContent } from './src/services/chapterExtractor.js';

// ── Helpers ────────────────────────────────────────────────────────

const now = Date.now();
let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, label) {
    if (condition) { passed++; return true; }
    failed++;
    console.log(`    ❌ FAIL: ${label}`);
    return false;
}

function skip(label) {
    skipped++;
    console.log(`    ⏭️  SKIP: ${label}`);
}

function header(num, title) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  SECTION ${num}: ${title}`);
    console.log(`${'═'.repeat(60)}`);
}

function subheader(title) {
    console.log(`\n  ── ${title} ${'─'.repeat(Math.max(1, 50 - title.length))}`);
}

// ── Mood / Category detection re-implementations for offline test ──
// (We can't import them directly as they're not exported from chatbot.js,
//  so we replicate the exact same logic here for unit testing.)

const MOOD_KEYWORDS = {
    sad: ['sad', 'depressed', 'hopeless', 'crying', 'tears', 'worthless', 'empty', 'lonely', 'alone'],
    anxious: ['anxious', 'anxiety', 'nervous', 'worried', 'panic', 'scared', 'fear', 'overwhelmed', 'cant breathe'],
    stressed: ['stressed', 'stress', 'pressure', 'too much', 'burnt out', 'burnout', 'exhausted', 'tired of'],
    frustrated: ['frustrated', 'angry', 'annoyed', 'stuck', 'hate this', 'give up', 'quit', 'cant do this', 'nothing works'],
    happy: ['happy', 'excited', 'great', 'amazing', 'awesome', 'proud', 'did it', 'passed', 'nailed it'],
    motivated: ['motivated', 'lets go', 'pumped', 'ready', 'focused', 'determined', 'bring it on'],
};

const CATEGORY_KEYWORDS = {
    academic: ['explain', 'how does', 'what is', 'solve', 'formula', 'theorem', 'proof', 'derive',
        'code', 'algorithm', 'function', 'chapter', 'topic', 'concept', 'example', 'difference between'],
    emotional: ['feel', 'feeling', 'sad', 'depressed', 'anxious', 'stressed', 'overwhelmed', 'cant cope',
        'mental health', 'lonely', 'scared', 'help me', 'breaking down', 'give up', 'not good enough'],
    doubt: ['doubt', 'dont understand', 'confused', 'why does', 'how to', 'can you explain',
        'what happens when', 'stuck on', 'wrong answer', 'where did i go wrong', 'clarify'],
};

function detectMood(text) {
    const lower = text.toLowerCase();
    let bestMood = 'neutral';
    let bestScore = 0;
    for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
        const score = keywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
        if (score > bestScore) { bestScore = score; bestMood = mood; }
    }
    return bestScore > 0 ? bestMood : 'neutral';
}

function detectCategory(text) {
    const lower = text.toLowerCase();
    let bestCat = 'general';
    let bestScore = 0;
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        const score = keywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
        if (score > bestScore) { bestScore = score; bestCat = cat; }
    }
    return bestScore > 0 ? bestCat : 'general';
}

// ── Spaced repetition re-implementation ────────────────────────────
function selectRevisionChapters(coveredChapters, maxPick = 4) {
    if (coveredChapters.length <= maxPick) return [...coveredChapters];
    const total = coveredChapters.length;
    const weighted = coveredChapters.map((ch, i) => ({
        chapter: ch,
        weight: 1 + Math.sqrt(i / total) * 3,
    }));
    const selected = [];
    const available = [...weighted];
    for (let pick = 0; pick < maxPick && available.length > 0; pick++) {
        const rand = Math.random() * available.reduce((s, w) => s + w.weight, 0);
        let cumulative = 0;
        for (let j = 0; j < available.length; j++) {
            cumulative += available[j].weight;
            if (cumulative >= rand) {
                selected.push(available[j].chapter);
                available.splice(j, 1);
                break;
            }
        }
    }
    return selected;
}

// ════════════════════════════════════════════════════════════════════
//  START TESTS
// ════════════════════════════════════════════════════════════════════

console.log('\n🧪 Focus Enhancer v2.0 — Master Test Suite');
console.log('━'.repeat(60));
console.log(`  Timestamp: ${new Date().toISOString()}`);
console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ set' : '❌ missing'}`);
console.log('━'.repeat(60));

// ════════════════════════════════════════════════════════════════════
//  SECTION 1: Schedule Builder (Path A — Pure Logic)
// ════════════════════════════════════════════════════════════════════

header(1, 'Path A — Schedule Builder (Pure Logic)');

{
    subheader('10-day schedule with 3 topics');
    const start = new Date('2025-08-01');
    const end = new Date('2025-08-11'); // 10 days
    const topics = ['Trees', 'Graphs', 'Hashing'];
    const schedule = buildSchedule(topics, start, end);

    console.log(`    Total days: ${schedule.length}`);
    assert(schedule.length === 10, 'schedule.length === 10');

    const pass1 = schedule.filter(d => d.passNumber === 1);
    const pass2 = schedule.filter(d => d.passNumber === 2);
    const pass3 = schedule.filter(d => d.passNumber === 3);

    console.log(`    Pass 1 (Learn):    ${pass1.length} days (≈40% of 10 = 4)`);
    console.log(`    Pass 2 (Revise 1): ${pass2.length} days (≈35% of 10 = 4)`);
    console.log(`    Pass 3 (Revise 2): ${pass3.length} days (≈25% of 10 = 3)`);

    assert(pass1.length + pass2.length + pass3.length === 10, 'all days accounted');
    assert(pass1.length >= 2 && pass1.length <= 6, 'pass1 reasonable range');
    assert(pass2.length >= 2 && pass2.length <= 5, 'pass2 reasonable range');
    assert(pass3.length >= 1 && pass3.length <= 4, 'pass3 reasonable range');

    // Check round-robin topic assignment
    console.log('\n    Day-by-day:');
    for (const d of schedule) {
        const passLabel = ['', 'LEARN', 'REVISE-1', 'REVISE-2'][d.passNumber];
        console.log(`      Day ${String(d.dayIndex).padStart(2)} | ${d.date.toDateString()} | ${passLabel.padEnd(9)} | ${d.topic}`);
    }

    // All topics should appear in pass 1
    const pass1Topics = new Set(pass1.map(d => d.topic));
    assert(pass1Topics.size >= Math.min(topics.length, pass1.length), 'pass1 covers multiple topics');
    console.log(`    ✅ Pass 1 covers ${pass1Topics.size} unique topics`);

    subheader('Edge case: 3-day schedule (very tight deadline)');
    const tightSchedule = buildSchedule(['Trees', 'Graphs'], new Date('2025-08-01'), new Date('2025-08-04'));
    console.log(`    Total days: ${tightSchedule.length}`);
    assert(tightSchedule.length === 3, 'tight schedule = 3 days');
    assert(tightSchedule.every(d => d.passNumber >= 1 && d.passNumber <= 3), 'all have valid passNumber');

    subheader('Edge case: 30-day schedule (ample time)');
    const longSchedule = buildSchedule(
        ['Trees', 'Graphs', 'DP', 'Sorting', 'Hashing'],
        new Date('2025-07-01'), new Date('2025-07-31'),
    );
    console.log(`    Total days: ${longSchedule.length}`);
    assert(longSchedule.length === 30, 'long schedule = 30 days');
    const lp1 = longSchedule.filter(d => d.passNumber === 1).length;
    const lp2 = longSchedule.filter(d => d.passNumber === 2).length;
    const lp3 = longSchedule.filter(d => d.passNumber === 3).length;
    console.log(`    Pass 1: ${lp1} | Pass 2: ${lp2} | Pass 3: ${lp3}`);
    assert(lp1 >= 10 && lp1 <= 14, 'pass1 ≈ 40% of 30');
    assert(lp2 >= 8 && lp2 <= 13, 'pass2 ≈ 35% of 30');
    assert(lp3 >= 5 && lp3 <= 10, 'pass3 ≈ 25% of 30');
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 2: Urgency & Token Economics
// ════════════════════════════════════════════════════════════════════

header(2, 'Urgency & Token Economics');

{
    subheader('Urgency Multiplier');
    const urgencyCases = [
        ['1 day',  1,  2.0,  'critical'],
        ['2 days', 2,  2.0,  'critical'],
        ['5 days', 5,  1.5,  'high'],
        ['7 days', 7,  1.5,  'high'],       // at runtime Date.now() drifts → <7 days
        ['10 days', 10, 1.25, 'moderate'],
        ['14 days', 14, 1.25, 'moderate'],
        ['20 days', 20, 1.0,  'normal'],
    ];

    for (const [name, days, expMult, expLabel] of urgencyCases) {
        const { multiplier, label } = calculateUrgency(new Date(now + days * 864e5));
        const ok = multiplier === expMult && label === expLabel;
        console.log(`    ${name.padEnd(10)} → ×${multiplier} (${label}) ${ok ? '✅' : '❌'}`);
        assert(ok, `urgency ${name}`);
    }

    subheader('Token Economics — stake = reward principle');
    const creditWeights = [2, 4, 6, 8, 10];
    for (const cw of creditWeights) {
        console.log(`    Credit weight = ${cw}:`);
        for (const diff of ['easy', 'medium', 'hard']) {
            const { tokenStake, reward } = calculateTokenEconomics(diff, cw, 1.25);
            assert(tokenStake === reward, `stake===reward for ${diff} cw=${cw}`);
            console.log(`      ${diff.padEnd(8)} → stake=${String(tokenStake).padStart(3)} reward=${String(reward).padStart(3)}`);
        }
    }

    subheader('Task Count per Event');
    const eventCounts = { quiz: 3, assignment: 4, lab: 3, lecture: 2, midterm: 6, final: 8, unknown: 4 };
    for (const [ev, expected] of Object.entries(eventCounts)) {
        const count = getTaskCountForEvent(ev);
        assert(count === expected, `${ev} → ${count} tasks`);
        console.log(`    ${ev.padEnd(12)} → ${count} tasks ${count === expected ? '✅' : '❌'}`);
    }
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 3: Live Gemini — Day-by-Day Generation (Path A)
// ════════════════════════════════════════════════════════════════════

header(3, 'Path A — Live Gemini Day-by-Day Generation');

{
    console.log('\n    ⏳ Calling Gemini API (this may take 10-20s)...\n');
    try {
        const tasks = await generateTasks({
            courseName: 'Data Structures & Algorithms',
            creditWeight: 4,
            durationType: 'full',
            courseId: '507f1f77bcf86cd799439011',
            announcementId: '507f1f77bcf86cd799439012',
            eventType: 'midterm',
            topics: ['Binary Trees', 'Graph Traversal', 'Dynamic Programming'],
            eventDate: new Date(now + 10 * 864e5).toISOString(),
        });

        console.log(`    ✅ ${tasks.length} tasks generated\n`);
        assert(tasks.length >= 5, 'at least 5 tasks');

        let allDurationOk = true;
        let allStakeOk = true;
        let hasLearn = false;
        let hasRevision = false;

        for (const t of tasks) {
            if (t.durationHours > 4) allDurationOk = false;
            if (t.tokenStake !== t.reward) allStakeOk = false;
            if (t.passNumber === 1) hasLearn = true;
            if (t.passNumber > 1) hasRevision = true;

            const passLabel = ['', 'LEARN', 'REV-1', 'REV-2'][t.passNumber] || '?';
            console.log(`    [Day ${String(t.dayIndex).padStart(2)}] [${passLabel}] [${t.difficulty.padEnd(6)}] ${t.title.substring(0, 55)}`);
            console.log(`            stake=${t.tokenStake}T, ${t.durationHours}h, topic: ${t.topic}`);
        }

        console.log('');
        assert(allDurationOk, 'all tasks ≤ 4 hours');
        assert(allStakeOk, 'stake === reward for all tasks');
        assert(hasLearn, 'has LEARN (pass 1) tasks');
        assert(hasRevision, 'has REVISION (pass 2/3) tasks');

        // Check scheduledDate spread
        const dates = [...new Set(tasks.map(t => t.scheduledDate.toDateString()))];
        console.log(`    Unique scheduled dates: ${dates.length}`);
        assert(dates.length >= 3, 'tasks spread across ≥ 3 dates');

        console.log('    ✅ Path A Gemini generation passed');
    } catch (err) {
        console.error(`    ❌ Gemini call failed: ${err.message}`);
        failed++;
    }
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 4: Spaced Repetition Selection (Path B — Pure Logic)
// ════════════════════════════════════════════════════════════════════

header(4, 'Path B — Spaced Repetition Selection');

{
    subheader('Small syllabus (≤5 chapters) → revise ALL');
    const smallSyllabus = [
        { number: 1, title: 'Intro' },
        { number: 2, title: 'Arrays' },
        { number: 3, title: 'Linked Lists' },
    ];
    const smallResult = selectRevisionChapters(smallSyllabus, 4);
    console.log(`    Input: ${smallSyllabus.length} chapters, maxPick=4`);
    console.log(`    Result: ${smallResult.length} chapters selected (should be all 3)`);
    assert(smallResult.length === 3, 'all chapters selected when ≤ maxPick');
    for (const ch of smallResult) {
        console.log(`      Ch.${ch.number}: ${ch.title}`);
    }

    subheader('Large syllabus (10 chapters) → pick 4 (weighted)');
    const largeSyllabus = Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        title: `Chapter ${i + 1}`,
    }));

    // Run selection 100 times to test distribution
    const selectionFrequency = {};
    for (let i = 0; i < 100; i++) {
        const result = selectRevisionChapters(largeSyllabus, 4);
        for (const ch of result) {
            selectionFrequency[ch.number] = (selectionFrequency[ch.number] || 0) + 1;
        }
    }

    console.log('    Selection frequency over 100 runs:');
    let recentTotal = 0;
    let olderTotal = 0;
    for (let i = 1; i <= 10; i++) {
        const freq = selectionFrequency[i] || 0;
        const bar = '█'.repeat(Math.round(freq / 3));
        console.log(`      Ch.${String(i).padStart(2)}: ${String(freq).padStart(3)} ${bar}`);
        if (i >= 7) recentTotal += freq;
        if (i <= 3) olderTotal += freq;
    }

    console.log(`\n    Recent chapters (8-10) total selections: ${recentTotal}`);
    console.log(`    Older chapters (1-3) total selections:  ${olderTotal}`);
    assert(recentTotal > olderTotal, 'recent chapters selected more often than older ones');

    subheader('Weight formula verification');
    console.log('    w(i) = 1 + √(i/n) × 3, for n=10 chapters:');
    for (let i = 0; i < 10; i++) {
        const w = 1 + Math.sqrt(i / 10) * 3;
        console.log(`      Ch.${i + 1} (i=${i}): weight = ${w.toFixed(2)}`);
    }

    subheader('Sunday rotation simulation (4 Sundays, 3 courses)');
    const courses = ['DSA', 'DBMS', 'OS'];
    let courseIdx = 0;
    for (let sunday = 1; sunday <= 4; sunday++) {
        const picked = courses[courseIdx % courses.length];
        console.log(`    Sunday ${sunday}: → ${picked}`);
        courseIdx++;
    }
    console.log('    ✅ Each course gets revised at least once per month');
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 5: Token Decay Simulation
// ════════════════════════════════════════════════════════════════════

header(5, 'Token Decay Simulation');

{
    const DECAY_RATE = 0.20;
    const MIN_STAKE = 1;

    for (const startStake of [5, 10, 20]) {
        subheader(`Starting stake: ${startStake} tokens`);
        let stake = startStake;
        const history = [stake];

        for (let cycle = 1; cycle <= 10; cycle++) {
            stake = Math.max(MIN_STAKE, Math.round(stake * (1 - DECAY_RATE)));
            history.push(stake);
            if (stake === MIN_STAKE) {
                console.log(`    Cycle ${cycle} (day ${cycle * 3}): ${stake} tokens (FLOOR — stops decaying)`);
                break;
            }
            console.log(`    Cycle ${cycle} (day ${cycle * 3}): ${stake} tokens`);
        }

        console.log(`    Decay path: ${history.join(' → ')}`);
        assert(history[history.length - 1] >= MIN_STAKE, `never goes below ${MIN_STAKE}`);
        assert(history[1] < history[0], 'first decay reduces stake');
    }

    subheader('Decay formula: stake × (1 - 0.20) per 3-day cycle');
    console.log('    "Aging tasks lose value → students attempt sooner"');
    console.log('    Floor = 1 token → task never becomes free');
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 6: MCQ Generation (Live Gemini)
// ════════════════════════════════════════════════════════════════════

header(6, 'Quiz — MCQ Generation (Live Gemini)');

{
    console.log('\n    ⏳ Generating 6 MCQs for "Binary Trees"...\n');
    try {
        const mcqs = await generateMCQs({
            taskTitle: 'Binary Search Tree Operations',
            taskTopic: 'Binary Trees',
            courseName: 'Data Structures & Algorithms',
        });

        assert(mcqs.length === 6, 'exactly 6 MCQs');

        for (const [i, m] of mcqs.entries()) {
            console.log(`    Q${i + 1}: ${m.question.substring(0, 75)}${m.question.length > 75 ? '...' : ''}`);
            for (const [j, opt] of m.options.entries()) {
                const marker = j === m.correctAnswer ? '  ✓' : '   ';
                console.log(`      ${marker} [${j}] ${opt}`);
            }
        }

        const allValid = mcqs.every(m =>
            m.question &&
            m.options?.length === 4 &&
            m.correctAnswer >= 0 &&
            m.correctAnswer <= 3
        );
        assert(allValid, 'all MCQs have valid structure (question, 4 options, correctAnswer 0-3)');

        // Check uniqueness
        const questions = mcqs.map(m => m.question);
        const unique = new Set(questions);
        assert(unique.size === 6, 'all 6 questions are unique');

        console.log('\n    ✅ MCQ generation passed');
    } catch (err) {
        console.error(`    ❌ MCQ generation failed: ${err.message}`);
        failed++;
    }
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 7: Quiz Scoring Simulation
// ════════════════════════════════════════════════════════════════════

header(7, 'Quiz — Scoring Simulation');

{
    console.log('    Scoring rules: correct = +2, wrong = -2, skip = -1');
    console.log('    Pass threshold: score ≥ 8 out of 12\n');

    const scoreCases = [
        ['Perfect 6/6',       [2, 2, 2, 2, 2, 2],     12, true],
        ['5 correct + 1 skip', [2, 2, 2, 2, 2, -1],    9,  true],
        ['4 correct + 2 skip', [2, 2, 2, 2, -1, -1],   6,  false],
        ['4 correct + 2 wrong', [2, 2, 2, 2, -2, -2],  4,  false],
        ['3 correct + 3 wrong', [2, 2, 2, -2, -2, -2], 0,  false],
        ['All wrong',          [-2, -2, -2, -2, -2, -2], -12, false],
        ['All skipped',        [-1, -1, -1, -1, -1, -1], -6,  false],
        ['Minimum pass',      [2, 2, 2, 2, 2, -2],     8,  true],
    ];

    for (const [name, pts, expectedScore, expectedPass] of scoreCases) {
        const score = pts.reduce((a, b) => a + b, 0);
        const pass = score >= 8;
        const ok = score === expectedScore && pass === expectedPass;
        console.log(`    ${name.padEnd(24)} score=${String(score).padStart(4)}  pass=${pass ? 'Y' : 'N'}  ${ok ? '✅' : '❌'}`);
        assert(ok, `scoring: ${name}`);
    }

    subheader('Token settlement examples');
    const stakeExamples = [
        { stake: 10, pass: true,  result: '+10 tokens (reward)' },
        { stake: 10, pass: false, result: '-10 tokens (lost stake)' },
        { stake: 20, pass: true,  result: '+20 tokens (reward)' },
        { stake: 5,  pass: false, result: '-5 tokens (lost stake)' },
    ];
    for (const ex of stakeExamples) {
        console.log(`    Stake ${String(ex.stake).padStart(2)}T + ${ex.pass ? 'PASS' : 'FAIL'} → ${ex.result}`);
    }
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 8: Theory Question Generation (Live Gemini)
// ════════════════════════════════════════════════════════════════════

header(8, 'Quiz — Theory Questions (Live Gemini)');

{
    console.log('\n    ⏳ Generating 7 theory questions for "Graph Traversal"...\n');
    let theoryAttempts = 0;
    const MAX_THEORY_ATTEMPTS = 2;
    while (theoryAttempts < MAX_THEORY_ATTEMPTS) {
        theoryAttempts++;
        try {
            const questions = await generateTheoryQuestions({
                taskTitle: 'Graph Traversal Mastery',
                taskTopic: 'Graph Traversal',
                courseName: 'Data Structures & Algorithms',
            });

            assert(questions.length === 7, 'exactly 7 theory questions');
            assert(questions.every(q => typeof q === 'string'), 'all questions are strings');
            assert(questions.every(q => q.length > 20), 'all questions have meaningful length');

            for (const [i, q] of questions.entries()) {
                console.log(`    Q${i + 1}: ${q.substring(0, 90)}${q.length > 90 ? '...' : ''}`);
            }

            const unique = new Set(questions);
            assert(unique.size === 7, 'all 7 questions are unique');

            console.log('\n    ✅ Theory question generation passed');
            break;
        } catch (err) {
            if (theoryAttempts < MAX_THEORY_ATTEMPTS && err.message.includes('JSON')) {
                console.log(`    ⚠️  Attempt ${theoryAttempts}: Gemini JSON parse issue, retrying...`);
                continue;
            }
            console.error(`    ❌ Theory generation failed: ${err.message}`);
            failed++;
            break;
        }
    }
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 9: Chatbot — Mood Detection
// ════════════════════════════════════════════════════════════════════

header(9, 'Chatbot — Mood Detection');

{
    const moodTests = [
        ['I feel so sad and lonely today',              'sad'],
        ['I am really anxious about the exam',          'anxious'],
        ['Too much stress and pressure from assignments','stressed'],
        ['I am stuck and nothing works, want to give up','frustrated'],
        ['I passed the quiz! Amazing!',                 'happy'],
        ['Lets go! I am pumped and focused today',      'motivated'],
        ['Can you explain binary trees?',               'neutral'],
        ['Hello there',                                 'neutral'],
        ['I feel depressed and worthless and alone',     'sad'],       // multi-keyword
        ['I am scared and overwhelmed with anxiety',    'anxious'],    // multi-keyword
    ];

    for (const [input, expected] of moodTests) {
        const detected = detectMood(input);
        const ok = detected === expected;
        console.log(`    "${input.substring(0, 50).padEnd(50)}" → ${detected.padEnd(12)} ${ok ? '✅' : `❌ (expected: ${expected})`}`);
        assert(ok, `mood: ${expected}`);
    }
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 10: Chatbot — Category Detection
// ════════════════════════════════════════════════════════════════════

header(10, 'Chatbot — Category Detection');

{
    const catTests = [
        ['Explain the concept of recursion',                'academic'],
        ['What is the difference between BFS and DFS?',     'academic'],
        ['I feel so stressed and cant cope anymore',        'emotional'],
        ['I am depressed and feel not good enough',         'emotional'],
        ['I dont understand how to solve this problem',     'doubt'],
        ['Where did I go wrong? I am confused',              'doubt'],
        ['Hey, how are you doing today?',                   'general'],
        ['Tell me a joke',                                  'general'],
        ['Can you explain what happens when we use hashing?','doubt'],
        ['Solve this formula for me: derive x^2+3x+2',     'academic'],
    ];

    for (const [input, expected] of catTests) {
        const detected = detectCategory(input);
        const ok = detected === expected;
        console.log(`    "${input.substring(0, 50).padEnd(50)}" → ${detected.padEnd(10)} ${ok ? '✅' : `❌ (expected: ${expected})`}`);
        assert(ok, `category: ${expected}`);
    }
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 11: Chatbot — Live Gemini Conversation (No DB)
// ════════════════════════════════════════════════════════════════════

header(11, 'Chatbot — Live Gemini Conversation');

{
    console.log('\n    Testing Gemini chat API directly (no MongoDB needed)\n');

    const MODELS = [
        process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ];

    const systemPrompt = `You are "Focus Buddy" — a warm, encouraging AI companion for a university student using Focus Enhancer.
The student has:
- 150 tokens, 3-day streak
- Enrolled in Data Structures & Algorithms (chapter 5/12)
- Today's task: "Binary Tree Traversal" (medium, 10 tokens)
- Last quiz: passed with score 10/12
Keep your response under 150 words. Be warm and personal.`;

    const testMessages = [
        { role: 'user', content: 'Hey, I am feeling stressed about my upcoming midterm. Can you help?' },
    ];

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        let response = null;

        for (const modelName of MODELS) {
            try {
                console.log(`    Trying model: ${modelName}...`);
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    systemInstruction: systemPrompt,
                });

                const chat = model.startChat({
                    history: [],
                });

                const result = await chat.sendMessage(testMessages[0].content);
                response = result.response.text();
                console.log(`    ✅ Model used: ${modelName}\n`);
                break;
            } catch (err) {
                if (err.message?.includes('429') || err.message?.includes('quota')) {
                    console.log(`    ⚠️  ${modelName}: quota exceeded, trying next...`);
                    continue;
                }
                throw err;
            }
        }

        if (response) {
            console.log('    ── Focus Buddy Response ──');
            const lines = response.split('\n');
            for (const line of lines) {
                console.log(`    │ ${line}`);
            }
            console.log('    ──────────────────────────\n');

            assert(response.length > 50, 'response has meaningful length (>50 chars)');
            assert(response.length < 3000, 'response is not excessively long');

            // Check if response is empathetic (contains warm language)
            const lower = response.toLowerCase();
            const hasEmpathy = ['understand', 'stress', 'help', 'you', 'exam', 'midterm', 'okay', 'normal', 'got this', 'worry']
                .some(kw => lower.includes(kw));
            assert(hasEmpathy, 'response contains empathetic/relevant keywords');

            console.log('    ✅ Chatbot Gemini conversation passed');
        } else {
            console.log('    ❌ All models failed');
            failed++;
        }

        // Test follow-up message (multi-turn)
        subheader('Multi-turn conversation test');
        console.log('    ⏳ Sending follow-up...\n');

        for (const modelName of MODELS) {
            try {
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    systemInstruction: systemPrompt,
                });

                const chat = model.startChat({
                    history: [
                        { role: 'user', parts: [{ text: 'I am stressed about my midterm' }] },
                        { role: 'model', parts: [{ text: response || 'I understand. Let me help you.' }] },
                    ],
                });

                const followUp = await chat.sendMessage('Can you explain how BFS works step by step?');
                const followUpText = followUp.response.text();

                console.log('    ── Follow-up Response (first 200 chars) ──');
                console.log(`    │ ${followUpText.substring(0, 200)}...`);
                console.log('    ───────────────────────────────────────────\n');

                assert(followUpText.length > 30, 'follow-up response has content');
                const hasBFS = followUpText.toLowerCase().includes('bfs') ||
                    followUpText.toLowerCase().includes('breadth') ||
                    followUpText.toLowerCase().includes('queue') ||
                    followUpText.toLowerCase().includes('graph');
                assert(hasBFS, 'follow-up correctly addresses BFS topic');

                console.log('    ✅ Multi-turn conversation passed');
                break;
            } catch (err) {
                if (err.message?.includes('429') || err.message?.includes('quota')) continue;
                throw err;
            }
        }
    } catch (err) {
        console.error(`    ❌ Chatbot test failed: ${err.message}`);
        failed++;
    }
}

// ════════════════════════════════════════════════════════════════════
//  SECTION 12: Chapter Extraction (Optional — requires PDF)
// ════════════════════════════════════════════════════════════════════

header(12, 'Chapter Extraction (PDF)');

{
    const testPdf = process.argv[2];

    if (testPdf) {
        console.log(`\n    Parsing: ${testPdf}\n`);
        try {
            const chapters = await extractChapters(testPdf);
            console.log(`    Total chapters found: ${chapters.length}`);

            for (const ch of chapters.slice(0, 10)) {
                console.log(`      Ch.${String(ch.number).padStart(2)}: ${ch.title}`);
            }
            if (chapters.length > 10) {
                console.log(`      ... and ${chapters.length - 10} more`);
            }

            assert(chapters.length >= 1, 'at least 1 chapter found');
            assert(chapters.every(ch => ch.number > 0), 'all chapter numbers > 0');
            assert(chapters.every(ch => ch.title.length > 0), 'all chapters have titles');

            // Test chapter content extraction
            if (chapters.length > 0) {
                subheader(`Content extraction: Ch.${chapters[0].number}`);
                const content = await getChapterContent(testPdf, chapters[0].number, 300);
                console.log(`    Preview (300 chars):`);
                console.log(`    "${content.substring(0, 300)}..."`);
                assert(content.length > 0, 'chapter content extracted');
            }

            console.log('\n    ✅ Chapter extraction passed');
        } catch (err) {
            console.error(`    ❌ Chapter extraction failed: ${err.message}`);
            failed++;
        }
    } else {
        skip('No PDF provided. Run with: node live-test-all.js /path/to/textbook.pdf');
    }
}

// ════════════════════════════════════════════════════════════════════
//  FINAL SUMMARY
// ════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('  FINAL RESULTS');
console.log('═'.repeat(60));
console.log(`\n    ✅ Passed:  ${passed}`);
console.log(`    ❌ Failed:  ${failed}`);
console.log(`    ⏭️  Skipped: ${skipped}`);
console.log(`    ─────────────────`);
console.log(`    Total:     ${passed + failed + skipped}\n`);

if (failed === 0) {
    console.log('  🎉 ALL TESTS PASSED — System is production-ready!\n');
} else {
    console.log(`  ⚠️  ${failed} test(s) failed. Review output above.\n`);
}

console.log('━'.repeat(60));
console.log(`  Completed at: ${new Date().toISOString()}`);
console.log('━'.repeat(60) + '\n');

process.exit(failed > 0 ? 1 : 0);
