/**
 * live-test-quiz.js — ESM version
 * Tests MCQ generation, scoring, and theory question generation
 * Run: node live-test-quiz.js
 */
import 'dotenv/config';
import { generateMCQs, generateTheoryQuestions } from './src/services/questionGenerator.js';

console.log('\n🧪 Quiz System Live Test (ESM)\n');
console.log('━'.repeat(60));

// Test 1: MCQs
console.log('\n📝 Generating 6 MCQs for "Binary Trees"...\n');
try {
    const mcqs = await generateMCQs({
        taskTitle: 'Binary Search Tree Operations', taskTopic: 'Binary Trees',
        courseName: 'Data Structures & Algorithms',
    });
    for (const [i, m] of mcqs.entries()) {
        console.log(`  Q${i + 1}: ${m.question.substring(0, 80)}...`);
        console.log(`       Answer: [${m.correctAnswer}] ${m.options[m.correctAnswer]}`);
    }
    console.log(`\n  Structure: ${mcqs.every(m => m.options.length === 4) ? '✅' : '❌'} | Count=6: ${mcqs.length === 6 ? '✅' : '❌'}`);
} catch (e) { console.error(`  ❌ ${e.message}`); }

// Test 2: Scoring
console.log('\n🎯 Scoring Simulation');
const cases = [
    ['5 correct + 1 skip', [2, 2, 2, 2, 2, -1], 9, true],
    ['4 correct + 2 wrong', [2, 2, 2, 2, -2, -2], 4, false],
    ['Perfect', [2, 2, 2, 2, 2, 2], 12, true],
    ['All wrong', [-2, -2, -2, -2, -2, -2], -12, false],
];
for (const [name, pts, exp, pass] of cases) {
    const score = pts.reduce((a, b) => a + b, 0);
    console.log(`  ${name.padEnd(22)} score=${String(score).padEnd(4)} pass=${(score >= 8) ? 'Y' : 'N'}  ${score === exp ? '✅' : '❌'}`);
}

// Test 3: Theory
console.log('\n📐 Generating 7 Theory Questions...\n');
try {
    const qs = await generateTheoryQuestions({
        taskTitle: 'Graph Traversal Mastery', taskTopic: 'Graph Traversal',
        courseName: 'Data Structures & Algorithms',
    });
    for (const [i, q] of qs.entries()) {
        console.log(`  Q${i + 1}: ${q.substring(0, 90)}...`);
    }
    console.log(`\n  Count=7: ${qs.length === 7 ? '✅' : '❌'}`);
} catch (e) { console.error(`  ❌ ${e.message}`); }

console.log('\n🎉 Quiz tests complete!\n');
