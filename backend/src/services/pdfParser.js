import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

/**
 * Extracts full text from a PDF file.
 */
export async function extractTextFromPdf(filePath) {
    if (!filePath || !existsSync(filePath)) {
        throw new Error(`PDF not found: ${filePath}`);
    }
    const buffer = readFileSync(filePath);
    const data = await pdf(buffer);
    if (!data.text?.trim()) {
        throw new Error('PDF empty or unreadable (possibly scanned images)');
    }
    return data.text.trim();
}

/**
 * Extracts topic-relevant sections from a PDF.
 * Falls back to first maxChars of full text if no sections matched.
 */
export async function extractRelevantContent(filePath, topics = [], maxChars = 12000) {
    const fullText = await extractTextFromPdf(filePath);
    if (!topics?.length) return fullText.substring(0, maxChars);

    const sections = fullText
        .split(/(?=(?:chapter|section|unit|module|part)\s+\d+)/gi)
        .filter((s) => s.trim().length > 50);

    if (sections.length <= 1) return fullText.substring(0, maxChars);

    const lowerTopics = topics.map((t) => t.toLowerCase());
    const relevant = sections
        .map((section) => ({
            section,
            score: lowerTopics.reduce((acc, t) => acc + (section.toLowerCase().includes(t) ? 1 : 0), 0),
        }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);

    if (!relevant.length) return fullText.substring(0, maxChars);

    let result = '';
    for (const { section } of relevant) {
        if (result.length + section.length > maxChars) {
            result += section.substring(0, maxChars - result.length);
            break;
        }
        result += section + '\n\n';
    }
    return result.trim();
}
