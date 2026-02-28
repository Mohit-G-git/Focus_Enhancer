import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractRelevantContent } from './pdfParser.js';

/**
 * Question Generator — 6 MCQs + 7 Theory per user per task.
 * Each invocation produces unique questions via Gemini.
 */

const GEMINI_MODELS = [
    process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-flash-latest',
];

async function callGemini(prompt) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let lastErr;
    for (const model of GEMINI_MODELS) {
        try {
            const r = await genAI.getGenerativeModel({ model }).generateContent(prompt);
            console.log(`✅ Question gen model: ${model}`);
            return r.response.text();
        } catch (err) {
            if (err.message?.includes('429') || err.message?.includes('quota')) {
                console.warn(`⚠️  ${model} quota exceeded`);
                lastErr = err;
                continue;
            }
            throw err;
        }
    }
    throw new Error(`All models quota-limited. ${lastErr?.message}`);
}

function parseJSON(raw) {
    return JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim());
}

// ── MCQ Generation ─────────────────────────────────────────────────

export async function generateMCQs({ taskTitle, taskTopic, courseName, bookPdfPath }) {
    let bookContent = '';
    if (bookPdfPath) {
        try { bookContent = await extractRelevantContent(bookPdfPath, [taskTopic]); }
        catch { /* proceed without */ }
    }

    const prompt = `Generate 6 UNIQUE conceptual MCQs for a rapid-fire quiz (15s per question).
Course: ${courseName} | Topic: ${taskTopic} | Task: ${taskTitle}
${bookContent ? `\nTextbook:\n${bookContent.substring(0, 6000)}` : ''}

RULES:
- 6 MCQs, 4 options each (index 0-3), mix of easy/medium/hard
- Test CONCEPTUAL understanding, not just recall
- correctAnswer = index of correct option
- Randomize correct answer positions
- Answerable in 15 seconds if student knows the material

Output ONLY a JSON array:
[{"question":"","options":["A","B","C","D"],"correctAnswer":0}]`;

    const mcqs = parseJSON(await callGemini(prompt));
    if (!Array.isArray(mcqs) || mcqs.length !== 6) throw new Error(`Expected 6 MCQs, got ${mcqs?.length}`);

    for (const m of mcqs) {
        if (!m.question || m.options?.length !== 4 || m.correctAnswer < 0 || m.correctAnswer > 3) {
            throw new Error('Invalid MCQ structure');
        }
    }
    return mcqs;
}

// ── Theory Question Generation ─────────────────────────────────────

export async function generateTheoryQuestions({ taskTitle, taskTopic, courseName, bookPdfPath }) {
    let bookContent = '';
    if (bookPdfPath) {
        try { bookContent = await extractRelevantContent(bookPdfPath, [taskTopic]); }
        catch { /* proceed without */ }
    }

    const prompt = `Generate 7 THEORY questions requiring HANDWRITTEN solutions (derivations, numericals, proofs, diagrams).
Course: ${courseName} | Topic: ${taskTopic} | Task: ${taskTitle}
${bookContent ? `\nTextbook:\n${bookContent.substring(0, 6000)}` : ''}

RULES:
- 7 questions, mix of 2 easy + 3 medium + 2 hard
- Require pen-and-paper work: derivations, proofs, calculations, algorithm traces
- Self-contained with all necessary data
- 5-15 minutes each

Output ONLY a JSON array of strings:
["Question 1 text...","Question 2 text..."]`;

    const qs = parseJSON(await callGemini(prompt));
    if (!Array.isArray(qs) || qs.length !== 7) throw new Error(`Expected 7 theory Qs, got ${qs?.length}`);
    return qs;
}
