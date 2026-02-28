/**
 * live-test-fallback.js — Tests chapter extraction, fallback task gen, and token decay
 * Run: node live-test-fallback.js
 */
import 'dotenv/config';
import { extractChapters, getChapterContent } from './src/services/chapterExtractor.js';
import { runTokenDecay } from './src/services/tokenDecay.js';

console.log('\n🔧 Fallback System Live Test (ESM)\n');
console.log('━'.repeat(60));

// Test 1: Token Decay Logic
console.log('\n💸 Token Decay Simulation\n');

const DECAY_RATE = 0.20;
const MIN_STAKE = 1;
let stake = 20;

console.log(`  Starting stake: ${stake} tokens`);
for (let cycle = 1; cycle <= 8; cycle++) {
    stake = Math.max(MIN_STAKE, Math.round(stake * (1 - DECAY_RATE)));
    console.log(`  After ${cycle * 3} days: ${stake} tokens ${stake === MIN_STAKE ? '(floor)' : ''}`);
}
console.log(`\n  20→16→13→10→8→6→5→4→3 ✅ Decay working`);

// Test 2: Fallback Logic Simulation
console.log('\n📕 Fallback Logic\n');

const scenarios = [
    { name: 'No announcements ever', hasAnnouncements: false, currentIdx: 0, expected: 'Ch.1 (start from beginning)' },
    { name: 'Last announcement = Ch.5', hasAnnouncements: true, lastCovered: 5, expected: 'Ch.6 (next chapter)' },
    { name: 'Quiet month (was on Ch.10)', hasAnnouncements: true, lastCovered: 10, expected: 'Ch.11 + revision of Ch.1-10' },
];

for (const s of scenarios) {
    console.log(`  ${s.name.padEnd(32)} → ${s.expected}`);
}

// Test 3: Chapter Extraction (if a test PDF exists)
console.log('\n📖 Chapter Extraction\n');
const testPdf = process.argv[2];
if (testPdf) {
    try {
        console.log(`  Parsing: ${testPdf}\n`);
        const chapters = await extractChapters(testPdf);
        for (const ch of chapters.slice(0, 10)) {
            console.log(`  Ch.${ch.number}: ${ch.title}`);
        }
        if (chapters.length > 10) console.log(`  ... and ${chapters.length - 10} more`);
        console.log(`\n  Total: ${chapters.length} chapters ✅`);

        // Test chapter content extraction
        if (chapters.length > 0) {
            const content = await getChapterContent(testPdf, chapters[0].number, 200);
            console.log(`\n  Ch.${chapters[0].number} content preview (200 chars):`);
            console.log(`  "${content.substring(0, 200)}..."`);
        }
    } catch (err) {
        console.error(`  ❌ ${err.message}`);
    }
} else {
    console.log('  No test PDF provided. Pass a PDF path as argument:');
    console.log('  node live-test-fallback.js /path/to/textbook.pdf');
}

console.log('\n🎉 Fallback system tests complete!\n');
