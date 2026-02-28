import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * ============================================================
 *  SHARED GEMINI CLIENT — Centralised, Throttled, Cascading
 * ============================================================
 *
 *  Every service that talks to Gemini goes through this module.
 *
 *  Features:
 *    • 10-second global throttle between consecutive API calls
 *      (prevents free-tier 429s which cap at ≈15 RPM)
 *    • Three-model cascade: flash-lite → flash → flash-latest
 *    • Single GoogleGenerativeAI instance (reused)
 *    • Two entry points:
 *        generateContent(prompt, tag)  — plain prompt → text
 *        chatCompletion(systemPrompt, history, tag) — multi-turn
 *
 * ============================================================
 */

const GEMINI_MODELS = [
    process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-flash-latest',
];

const THROTTLE_MS = parseInt(process.env.GEMINI_THROTTLE_MS, 10) || 10_000;

// ── Singleton SDK instance ─────────────────────────────────────────
let _genAI;
function getGenAI() {
    if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    return _genAI;
}

// ── Global throttle gate ───────────────────────────────────────────
let _lastCallTime = 0;

async function throttle() {
    const now = Date.now();
    const elapsed = now - _lastCallTime;
    if (elapsed < THROTTLE_MS && _lastCallTime > 0) {
        const wait = THROTTLE_MS - elapsed;
        console.log(`⏳ Gemini throttle: waiting ${(wait / 1000).toFixed(1)}s...`);
        await new Promise((r) => setTimeout(r, wait));
    }
    _lastCallTime = Date.now();
}

// ── Cascading generateContent ──────────────────────────────────────

/**
 * Send a plain prompt to Gemini. Returns the raw text response.
 *
 * @param {string}  prompt — the full prompt text
 * @param {string}  [tag='Gemini'] — label for console logs
 * @returns {Promise<string>}
 */
export async function generateContent(prompt, tag = 'Gemini') {
    await throttle();
    const genAI = getGenAI();
    let lastErr;

    for (const modelName of GEMINI_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            console.log(`✅ ${tag} model: ${modelName}`);
            return result.response.text();
        } catch (err) {
            if (err.message?.includes('429') || err.message?.includes('quota')) {
                console.warn(`⚠️  ${modelName} quota exceeded — fallback...`);
                lastErr = err;
                continue;
            }
            throw err;
        }
    }
    throw new Error(`All Gemini models quota-limited. ${lastErr?.message}`);
}

// ── Cascading Chat (multi-turn) ────────────────────────────────────

/**
 * Multi-turn chat completion. Uses chat.sendMessage() under the hood.
 *
 * @param {string}   systemPrompt — system instruction
 * @param {Array<{role: string, content: string}>} chatHistory
 *        Each entry has role ('user' | 'assistant') and content.
 *        The LAST entry must be role:'user' — it is sent as the new message.
 * @param {string}   [tag='Chatbot'] — label for console logs
 * @returns {Promise<string>}
 */
export async function chatCompletion(systemPrompt, chatHistory, tag = 'Chatbot') {
    await throttle();
    const genAI = getGenAI();
    let lastErr;

    const lastUserMsg = chatHistory[chatHistory.length - 1];
    const history = chatHistory.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));

    for (const modelName of GEMINI_MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: systemPrompt,
            });
            const chat = model.startChat({ history });
            const result = await chat.sendMessage(lastUserMsg.content);
            console.log(`✅ ${tag} model: ${modelName}`);
            return result.response.text();
        } catch (err) {
            if (err.message?.includes('429') || err.message?.includes('quota')) {
                console.warn(`⚠️  ${modelName} quota exceeded`);
                lastErr = err;
                continue;
            }
            throw err;
        }
    }
    throw new Error(`All Gemini models quota-limited. ${lastErr?.message}`);
}

// ── JSON helper ────────────────────────────────────────────────────

/**
 * Strip markdown code fences and parse JSON from Gemini output.
 */
export function parseJSON(raw) {
    return JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim());
}

/**
 * Reset throttle state (useful for tests).
 */
export function _resetThrottle() {
    _lastCallTime = 0;
}
