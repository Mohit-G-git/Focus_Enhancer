import { extractTextFromPdf } from './pdfParser.js';

/**
 * ============================================================
 *  CHAPTER EXTRACTOR — Auto-parse chapters from course book PDF
 * ============================================================
 *  Scans for patterns like:
 *    "Chapter 1:", "CHAPTER 1 -", "Ch. 1", "Unit 1",
 *    "Module 1", "Part 1", "Section 1", "1. Title"
 *  Returns ordered array of { number, title, startIndex }.
 * ============================================================
 */

// Regex patterns that match common textbook chapter headings
const CHAPTER_PATTERNS = [
    // "Chapter 1: Introduction" or "CHAPTER 1 - Intro"
    /(?:^|\n)\s*(chapter|ch\.?)\s*(\d+)\s*[:\-–—.]?\s*(.+?)(?:\n|$)/gi,
    // "Unit 1: Title" or "Unit 1 – Title"
    /(?:^|\n)\s*(unit|module|part)\s*(\d+)\s*[:\-–—.]?\s*(.+?)(?:\n|$)/gi,
    // "1. Introduction" or "1 Introduction" (number at start of line)
    /(?:^|\n)\s*(\d{1,2})\s*[.\s]\s*([A-Z][A-Za-z\s,&:]+?)(?:\n|$)/g,
    // "Section 1.1: Title"
    /(?:^|\n)\s*section\s*(\d+(?:\.\d+)?)\s*[:\-–—.]?\s*(.+?)(?:\n|$)/gi,
];

/**
 * Extract chapter list from a PDF file.
 *
 * @param {string} pdfPath - Absolute path to the course book PDF
 * @returns {Promise<Array<{number: number, title: string}>>}
 */
export async function extractChapters(pdfPath) {
    const fullText = await extractTextFromPdf(pdfPath);
    const chapters = new Map(); // number → title (deduplicates)

    // Try each pattern family
    for (const pattern of CHAPTER_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;

        while ((match = regex.exec(fullText)) !== null) {
            let chapterNum, title;

            if (match[3]) {
                // Patterns like "Chapter X: Title" → groups: (keyword, number, title)
                chapterNum = parseInt(match[2], 10);
                title = match[3].trim();
            } else if (match[2] && /^\d+$/.test(match[1])) {
                // Pattern like "1. Introduction" → groups: (number, title)
                chapterNum = parseInt(match[1], 10);
                title = match[2].trim();
            } else if (match[2]) {
                // Pattern like "Section 1.1: Title"
                chapterNum = parseFloat(match[1]);
                title = match[2].trim();
            } else {
                continue;
            }

            if (isNaN(chapterNum) || chapterNum <= 0 || chapterNum > 50) continue;
            if (title.length < 3 || title.length > 120) continue;

            // Clean up title
            title = title.replace(/\s+/g, ' ').replace(/[.…]+$/, '').trim();

            // Only keep first occurrence (usually from table of contents)
            if (!chapters.has(chapterNum)) {
                chapters.set(chapterNum, title);
            }
        }

        // If we found chapters with this pattern, stop trying others
        if (chapters.size >= 3) break;
    }

    // Sort by chapter number
    const sorted = Array.from(chapters.entries())
        .sort(([a], [b]) => a - b)
        .map(([number, title]) => ({ number, title }));

    // Fallback: if we found < 3 chapters, try splitting by page breaks / large gaps
    if (sorted.length < 3) {
        console.warn(`⚠️  Only found ${sorted.length} chapters via patterns. Attempting page-break fallback...`);
        return fallbackChapterExtraction(fullText);
    }

    console.log(`📖 Extracted ${sorted.length} chapters from PDF`);
    return sorted;
}

/**
 * Fallback: split text into roughly equal chunks and treat as "chapters".
 * Used when no heading patterns are found.
 */
function fallbackChapterExtraction(text) {
    // Split on common page boundaries or large whitespace gaps
    const pages = text.split(/\f|\n{4,}/);
    const chunkSize = Math.max(1, Math.floor(pages.length / 10)); // ~10 chapters

    const chapters = [];
    for (let i = 0; i < pages.length; i += chunkSize) {
        const chunk = pages.slice(i, i + chunkSize).join('\n');
        // Try to extract a title from the first non-empty line
        const firstLine = chunk.split('\n').find((l) => l.trim().length > 5)?.trim() || `Section ${chapters.length + 1}`;
        const title = firstLine.substring(0, 80).replace(/\s+/g, ' ');

        chapters.push({
            number: chapters.length + 1,
            title,
        });
    }

    console.log(`📖 Fallback: created ${chapters.length} sections from PDF`);
    return chapters;
}

/**
 * Get chapter content from PDF by chapter number.
 * Returns text between this chapter heading and the next.
 */
export async function getChapterContent(pdfPath, chapterNumber, maxChars = 10000) {
    const fullText = await extractTextFromPdf(pdfPath);
    const chapters = await extractChapters(pdfPath);

    const current = chapters.find((c) => c.number === chapterNumber);
    const next = chapters.find((c) => c.number > chapterNumber);

    if (!current) return fullText.substring(0, maxChars); // fallback

    // Find chapter heading position in text
    const startPattern = new RegExp(
        `(?:chapter|ch\\.?|unit|module|part|section)?\\s*${chapterNumber}\\s*[:\\-–—.\\s]\\s*${escapeRegex(current.title.substring(0, 30))}`,
        'i'
    );
    const startMatch = fullText.match(startPattern);
    const startIdx = startMatch ? startMatch.index : 0;

    let endIdx = fullText.length;
    if (next) {
        const endPattern = new RegExp(
            `(?:chapter|ch\\.?|unit|module|part|section)?\\s*${next.number}\\s*[:\\-–—.\\s]\\s*${escapeRegex(next.title.substring(0, 30))}`,
            'i'
        );
        const endMatch = fullText.match(endPattern);
        if (endMatch) endIdx = endMatch.index;
    }

    return fullText.substring(startIdx, Math.min(startIdx + maxChars, endIdx)).trim();
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
