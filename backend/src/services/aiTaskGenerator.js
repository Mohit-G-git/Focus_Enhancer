import { generateContent, parseJSON } from './geminiClient.js';
import { extractRelevantContent } from './pdfParser.js';

/**
 * ============================================================
 *  AI TASK GENERATOR — CR-Driven, Day-by-Day Scheduling
 * ============================================================
 *
 *  When a CR announces an event (e.g., midterm in 15 days on
 *  topics [Trees, Graphs, Hashing]), the system pre-generates
 *  ALL tasks upfront, spread day-by-day across 3 passes:
 *
 *    Pass 1 (Learn):    Cover each topic with fresh study tasks
 *    Pass 2 (Revise 1): Revise each topic (deeper / application)
 *    Pass 3 (Revise 2): Final revision (mixed, exam-ready)
 *
 *  The available days are split equally among the 3 passes.
 *  Within each pass, days are distributed across topics.
 *  Each day gets 1–2 tasks (1 reading/theory + 1 practice).
 *
 *  Stake = Reward. Urgency multiplier applies based on which
 *  pass the task falls in (later passes → event closer).
 *
 * ============================================================
 */

const BASE_STAKES = { easy: 5, medium: 10, hard: 20 };
const DURATION_RANGES = { easy: [1, 2], medium: [2, 3], hard: [3, 4] };
const MAX_DURATION_HOURS = 4;

// ── Utilities ──────────────────────────────────────────────────────

export function calculateUrgency(eventDate) {
    const days = Math.max(0, (new Date(eventDate) - Date.now()) / 864e5);
    if (days < 3) return { multiplier: 2.0, label: 'critical' };
    if (days < 7) return { multiplier: 1.5, label: 'high' };
    if (days <= 14) return { multiplier: 1.25, label: 'moderate' };
    return { multiplier: 1.0, label: 'normal' };
}

export function calculateTokenEconomics(difficulty, creditWeight, urgencyMultiplier = 1.0) {
    const weightFactor = Math.max(1, Math.min(10, creditWeight)) / 5;
    const tokenStake = Math.round(BASE_STAKES[difficulty] * weightFactor * urgencyMultiplier);
    return { tokenStake, reward: tokenStake };
}

export function getTaskCountForEvent(eventType) {
    return { quiz: 3, assignment: 4, lab: 3, lecture: 2, midterm: 6, final: 8 }[eventType] || 4;
}



// ── Schedule Builder ───────────────────────────────────────────────

/**
 * Build the day-by-day schedule map.
 *
 * Given the time until the event and topics, produces a flat array
 * of { date, topic, passNumber, dayIndex } entries.
 *
 * Days are split into 3 passes:
 *   Pass 1 ≈ 40%   (fresh learning — needs more time)
 *   Pass 2 ≈ 35%   (first revision — application & depth)
 *   Pass 3 ≈ 25%   (final revision — exam-ready, mixed)
 *
 * Within each pass, days rotate through topics round-robin.
 */
export function buildSchedule(topics, startDate, eventDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(eventDate);
    end.setHours(0, 0, 0, 0);

    // Total available days (exclude event day itself)
    const totalDays = Math.max(1, Math.round((end - start) / 864e5));

    // Split into 3 passes
    const pass1Days = Math.max(1, Math.round(totalDays * 0.40));
    const pass2Days = Math.max(1, Math.round(totalDays * 0.35));
    const pass3Days = Math.max(1, totalDays - pass1Days - pass2Days);

    const schedule = [];
    let dayOffset = 0;

    for (const [passNum, passDayCount] of [[1, pass1Days], [2, pass2Days], [3, pass3Days]]) {
        for (let d = 0; d < passDayCount; d++) {
            const topicIdx = d % topics.length;
            const date = new Date(start);
            date.setDate(date.getDate() + dayOffset);

            schedule.push({
                date,
                topic: topics[topicIdx],
                passNumber: passNum,
                dayIndex: dayOffset,
            });
            dayOffset++;
        }
    }

    return schedule;
}

// ── Prompt ─────────────────────────────────────────────────────────

function buildDayByDayPrompt({
    courseName, creditWeight, durationType, eventType,
    daySchedule, bookContent,
}) {
    const topicsList = [...new Set(daySchedule.map((d) => d.topic))];

    // Group schedule for the prompt
    const scheduleDesc = daySchedule.map((d) => {
        const passLabel = d.passNumber === 1 ? 'LEARN' : d.passNumber === 2 ? 'REVISE-1' : 'REVISE-2';
        return `  Day ${d.dayIndex} (${d.date.toDateString()}): ${passLabel} — "${d.topic}"`;
    }).join('\n');

    const durStr = Object.entries(DURATION_RANGES)
        .map(([k, [a, b]]) => `${k}: ${a}-${b}h`).join(', ');

    return `You are an AI task generator for "Focus Enhancer".
Generate a DAY-BY-DAY study plan for an upcoming ${eventType.toUpperCase()}.

## Context
- Course: ${courseName} (credits: ${creditWeight}/10, ${durationType === 'full' ? '16-week' : '8-week'})
- Topics to cover: ${topicsList.join(', ')}
- Total study days: ${daySchedule.length}
${bookContent ? `\n## Textbook excerpt\n${bookContent.substring(0, 8000)}` : ''}

## Schedule
${scheduleDesc}

## RULES
1. Generate EXACTLY one JSON object per day in the schedule above (use dayIndex values exactly).
2. For LEARN days (Pass 1): generate 2 tasks — one reading/theory + one practice (coding/writing/quiz).
3. For REVISE-1 days (Pass 2): generate 1-2 tasks — application problems, medium-hard, testing deeper understanding.
4. For REVISE-2 days (Pass 3): generate 1-2 tasks — mixed/exam-style, hard difficulty, timed practice.
5. Each task ≤ ${MAX_DURATION_HOURS} hours. Duration guides: [${durStr}].
6. Tasks must be specific, actionable, and clearly reference the topic.
7. REVISE tasks should test retention: "Can you still do X?" / "Solve without notes."
8. Later passes should build on earlier ones — don't just repeat the same task.

## Output Format
Return ONLY a JSON array. Each element = one day:
[
  {
    "dayIndex": 0,
    "tasks": [
      {"title":"","description":"","topic":"","type":"reading|writing|coding|quiz|project","difficulty":"easy|medium|hard","durationHours":0}
    ]
  }
]`;
}

// ── Main Function ──────────────────────────────────────────────────

export async function generateTasks(input) {
    const {
        courseName, creditWeight = 5, durationType = 'full',
        courseId, announcementId, eventType, topics, eventDate,
        bookPdfPath = null,
    } = input;

    if (!courseId || !announcementId || !eventType || !topics?.length || !eventDate) {
        throw new Error('Missing required fields: courseId, announcementId, eventType, topics, eventDate');
    }

    // Build the day-by-day schedule
    const now = new Date();
    const schedule = buildSchedule(topics, now, eventDate);
    console.log(`📅 Schedule: ${schedule.length} days across 3 passes for ${topics.length} topics`);

    // Extract book content for context
    let bookContent = '';
    if (bookPdfPath) {
        try {
            bookContent = await extractRelevantContent(bookPdfPath, topics);
            console.log(`📖 Extracted ${bookContent.length} chars from book`);
        } catch (e) {
            console.warn(`⚠️  Book parse failed: ${e.message}`);
        }
    }

    const prompt = buildDayByDayPrompt({
        courseName, creditWeight, durationType, eventType,
        daySchedule: schedule, bookContent,
    });

    const raw = await generateContent(prompt, 'Task gen');
    const aiDays = parseJSON(raw);

    if (!Array.isArray(aiDays)) throw new Error('AI did not return a JSON array');

    // Flatten into task documents with scheduling metadata
    const allTasks = [];

    for (const aiDay of aiDays) {
        const dayIdx = aiDay.dayIndex ?? aiDay.day_index ?? 0;
        const scheduledEntry = schedule[dayIdx];

        if (!scheduledEntry) {
            console.warn(`⚠️  AI returned dayIndex ${dayIdx} out of range, skipping`);
            continue;
        }

        const { date, topic: scheduledTopic, passNumber } = scheduledEntry;
        const isRevision = passNumber > 1;

        // Urgency based on how close this specific day is to the event
        const daysFromEvent = Math.max(0, (new Date(eventDate) - date) / 864e5);
        let urgencyMult, urgencyLabel;
        if (daysFromEvent < 3) { urgencyMult = 2.0; urgencyLabel = 'critical'; }
        else if (daysFromEvent < 7) { urgencyMult = 1.5; urgencyLabel = 'high'; }
        else if (daysFromEvent <= 14) { urgencyMult = 1.25; urgencyLabel = 'moderate'; }
        else { urgencyMult = 1.0; urgencyLabel = 'normal'; }

        const dayTasks = Array.isArray(aiDay.tasks) ? aiDay.tasks : [aiDay];

        for (const t of dayTasks) {
            const difficulty = ['easy', 'medium', 'hard'].includes(t.difficulty?.toLowerCase())
                ? t.difficulty.toLowerCase()
                : (passNumber === 1 ? 'easy' : passNumber === 2 ? 'medium' : 'hard');

            const { tokenStake, reward } = calculateTokenEconomics(difficulty, creditWeight, urgencyMult);

            const title = isRevision && !t.title?.startsWith('[REVISION')
                ? `[REVISION ${passNumber === 2 ? '1' : '2'}] ${t.title}`
                : t.title;

            allTasks.push({
                title,
                description: t.description,
                topic: t.topic || scheduledTopic,
                type: t.type || 'reading',
                difficulty,
                tokenStake,
                reward,
                urgencyMultiplier: urgencyMult,
                durationHours: Math.min(t.durationHours || DURATION_RANGES[difficulty][1], MAX_DURATION_HOURS),
                deadline: new Date(eventDate),
                scheduledDate: date,
                passNumber,
                isRevision,
                dayIndex: dayIdx,
                chapterRef: { number: null, title: '' },
                source: 'announcement',
                course: courseId,
                announcement: announcementId,
                aiGenerated: true,
                generationContext: {
                    courseName, creditWeight, eventType, urgency: urgencyLabel,
                },
            });
        }
    }

    console.log(`📊 Generated ${allTasks.length} tasks across ${schedule.length} days (3 passes)`);
    return allTasks;
}
