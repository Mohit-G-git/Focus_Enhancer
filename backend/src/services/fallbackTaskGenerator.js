import { generateContent, parseJSON } from './geminiClient.js';
import Course from '../models/Course.js';
import Task from '../models/Task.js';
import Announcement from '../models/Announcement.js';
import User from '../models/User.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { extractChapters, getChapterContent } from './chapterExtractor.js';

/**
 * ============================================================
 *  FALLBACK TASK GENERATOR — Book-based, No CR Needed
 * ============================================================
 *
 *  TWO FUNCTIONS:
 *
 *  1) WEEKLY CHAPTER TASKS (Mon–Sat):
 *     Called every Monday 6 AM.
 *     For each course with no CR activity in 30 days:
 *       - Generate 6 tasks (Mon–Sat), one per day, that cover
 *         the ENTIRE next chapter by week's end.
 *       - Day 1-2: reading / fundamentals (easy)
 *       - Day 3-4: application / practice (medium)
 *       - Day 5-6: advanced problems / synthesis (hard)
 *       - Advance course.currentChapterIndex.
 *
 *  2) SUNDAY REVISION (spaced repetition):
 *     Called every Sunday 6 AM.
 *     For each student, pick ONE enrolled course (rotating index).
 *     Generate revision tasks covering ALL previously studied
 *     chapters using spaced repetition weighting:
 *       - More recent chapters → higher probability
 *       - Older chapters → lower probability, but never zero
 *       - If syllabus is small (≤5 chapters done) → revise all
 *       - If syllabus is large → pick 3-4 weighted chapters
 *
 *  Token stakes use base values (no urgency multiplier).
 *
 * ============================================================
 */

const BASE_STAKES = { easy: 5, medium: 10, hard: 20 };


// ── Helper: add days to a date ─────────────────────────────────────

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

/**
 * Determine last covered chapter from announcement history.
 */
async function inferLastCoveredChapter(course) {
    const lastAnnouncement = await Announcement.findOne({ course: course._id })
        .sort({ eventDate: -1 });

    if (!lastAnnouncement || !course.chapters?.length) return -1;

    const topics = lastAnnouncement.topics.map((t) => t.toLowerCase());

    let highestMatch = -1;
    for (const ch of course.chapters) {
        const chTitle = ch.title.toLowerCase();
        if (topics.some((t) => chTitle.includes(t) || t.includes(chTitle))) {
            highestMatch = Math.max(highestMatch, course.chapters.indexOf(ch));
        }
    }

    return highestMatch;
}

// ════════════════════════════════════════════════════════════════════
//  PART 1: WEEKLY CHAPTER TASKS (Mon–Sat)
// ════════════════════════════════════════════════════════════════════

/**
 * Build Gemini prompt for a 6-day chapter study plan.
 */
function buildWeeklyChapterPrompt({ courseName, chapter, chapterContent, creditWeight }) {
    return `You are an AI study assistant for "Focus Enhancer".
Generate a 6-DAY study plan to completely cover one textbook chapter.

## Context
- Course: ${courseName} (credits: ${creditWeight}/10)
- Chapter: Ch.${chapter.number}: "${chapter.title}"
${chapterContent ? `\n## Chapter Content\n${chapterContent.substring(0, 8000)}` : ''}

## RULES
1. Generate EXACTLY 6 day entries (dayIndex 0–5, corresponding to Mon–Sat).
2. Day structure (progressive difficulty):
   - Day 0-1 (Mon-Tue): Reading & fundamentals — easy tasks, introduce core concepts.
   - Day 2-3 (Wed-Thu): Application & practice — medium tasks, solved examples, practice problems.
   - Day 4-5 (Fri-Sat): Advanced & synthesis — hard tasks, complex problems, connect sub-topics.
3. Each day has exactly 1 task. Each task ≤ 4 hours.
4. Tasks must be specific, actionable, and cover different sub-topics of the chapter.
5. By Day 5, the student should have covered the ENTIRE chapter.
6. Reference specific sections, theorems, algorithms, or concepts from the chapter.

## Output Format
JSON array only:
[
  {
    "dayIndex": 0,
    "title": "",
    "description": "",
    "topic": "",
    "type": "reading|writing|coding|quiz|project",
    "difficulty": "easy|medium|hard",
    "durationHours": 0
  }
]`;
}

/**
 * Generate Mon–Sat tasks for a single course's next chapter.
 * Called by the weekly Monday cron.
 */
export async function generateWeeklyChapterTasks(course) {
    if (!course.bookPdfPath) {
        console.log(`⏭️  ${course.title}: No book PDF, skipping`);
        return [];
    }

    // Extract chapters if not cached
    if (!course.chapters?.length) {
        try {
            const chapters = await extractChapters(course.bookPdfPath);
            course.chapters = chapters;
            await course.save();
            console.log(`📖 ${course.title}: extracted ${chapters.length} chapters`);
        } catch (err) {
            console.error(`❌ ${course.title}: chapter extraction failed: ${err.message}`);
            return [];
        }
    }

    if (course.chapters.length === 0) {
        console.warn(`⚠️  ${course.title}: No chapters found in PDF`);
        return [];
    }

    // Determine which chapter to study this week
    const inferredIdx = await inferLastCoveredChapter(course);
    let currentIdx;

    if (inferredIdx === -1) {
        currentIdx = course.currentChapterIndex || 0;
    } else {
        currentIdx = Math.min(inferredIdx + 1, course.chapters.length - 1);
    }

    // If we've already covered all chapters, wrap around (re-study from start)
    if (currentIdx >= course.chapters.length) {
        currentIdx = 0;
        console.log(`🔄 ${course.title}: All chapters covered, restarting from Ch.1`);
    }

    const chapter = course.chapters[currentIdx];
    console.log(`📚 ${course.title}: generating Mon–Sat tasks for Ch.${chapter.number} "${chapter.title}"`);

    // Get chapter content
    let chapterContent = '';
    try {
        chapterContent = await getChapterContent(course.bookPdfPath, chapter.number);
    } catch { /* proceed without */ }

    const prompt = buildWeeklyChapterPrompt({
        courseName: course.title,
        chapter,
        chapterContent,
        creditWeight: course.creditWeight,
    });

    const raw = await generateContent(prompt, 'Weekly fallback');
    const aiTasks = parseJSON(raw);
    if (!Array.isArray(aiTasks)) throw new Error('AI did not return array');

    // Monday of this week
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    // Ensure we start from this Monday
    const dayOfWeek = monday.getDay(); // 0=Sun, 1=Mon
    monday.setDate(monday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    // Sunday deadline (end of the week)
    const sunday = addDays(monday, 6);

    // Create a synthetic announcement for this chapter week
    const announcement = await Announcement.create({
        course: course._id,
        eventType: 'lecture',
        title: `Weekly Study: Ch.${chapter.number} — ${chapter.title}`,
        topics: [chapter.title],
        eventDate: sunday,
        description: `Auto-generated weekly chapter plan (Mon–Sat). Chapter ${chapter.number}.`,
        anonymous: true,
        createdBy: course.courseRep || course.enrolledStudents?.[0] || '000000000000000000000000',
        tasksGenerated: true,
    });

    const tasks = aiTasks.map((t) => {
        const dayIdx = t.dayIndex ?? 0;
        const scheduledDate = addDays(monday, Math.min(dayIdx, 5));

        // Progressive difficulty based on day
        const difficulty = ['easy', 'medium', 'hard'].includes(t.difficulty?.toLowerCase())
            ? t.difficulty.toLowerCase()
            : (dayIdx <= 1 ? 'easy' : dayIdx <= 3 ? 'medium' : 'hard');

        const weightFactor = Math.max(1, Math.min(10, course.creditWeight)) / 5;
        const tokenStake = Math.round((BASE_STAKES[difficulty] || 10) * weightFactor);

        return {
            title: t.title,
            description: t.description,
            topic: t.topic || chapter.title,
            type: t.type || 'reading',
            difficulty,
            tokenStake,
            reward: tokenStake,
            urgencyMultiplier: 1.0,
            durationHours: Math.min(t.durationHours || 2, 4),
            deadline: sunday,
            scheduledDate,
            passNumber: 1, // fresh learning
            isRevision: false,
            dayIndex: dayIdx,
            chapterRef: { number: chapter.number, title: chapter.title },
            source: 'fallback',
            course: course._id,
            announcement: announcement._id,
            aiGenerated: true,
            generationContext: {
                courseName: course.title,
                creditWeight: course.creditWeight,
                eventType: 'self-study',
                urgency: 'normal',
            },
        };
    });

    const inserted = await Task.insertMany(tasks);

    // ── Supersede old fallback tasks for the same week ─────────
    if (inserted.length > 0) {
        try {
            const newIds = inserted.map((t) => t._id);
            const oldFallbacks = await Task.find({
                course: course._id,
                _id: { $nin: newIds },
                source: { $in: ['fallback', 'sunday_revision'] },
                status: 'pending',
                scheduledDate: { $gte: monday, $lte: sunday },
            });

            if (oldFallbacks.length > 0) {
                const activeAttemptTaskIds = await QuizAttempt.find({
                    task: { $in: oldFallbacks.map((t) => t._id) },
                    status: 'mcq_in_progress',
                }).distinct('task');

                const protectedSet = new Set(activeAttemptTaskIds.map((id) => id.toString()));
                const toSupersede = oldFallbacks.filter((t) => !protectedSet.has(t._id.toString()));

                if (toSupersede.length > 0) {
                    await Task.updateMany(
                        { _id: { $in: toSupersede.map((t) => t._id) } },
                        { status: 'superseded', supersededBy: announcement._id },
                    );
                    console.log(`♻️  Superseded ${toSupersede.length} old fallback tasks`);
                }
            }
        } catch (superErr) {
            console.error(`⚠️  Fallback supersession failed: ${superErr.message}`);
        }
    }

    // Advance chapter progress
    course.currentChapterIndex = Math.min(currentIdx + 1, course.chapters.length);
    course.lastFallbackTaskDate = new Date();
    course.weeklyChapterStartDate = monday;
    await course.save();

    console.log(`✅ ${course.title}: ${inserted.length} Mon–Sat tasks for Ch.${chapter.number}`);
    return inserted;
}

// ════════════════════════════════════════════════════════════════════
//  PART 2: SUNDAY REVISION (Spaced Repetition)
// ════════════════════════════════════════════════════════════════════

/**
 * Spaced repetition weighting: more recent chapters get higher weight,
 * but older ones never drop to zero.
 *
 * Weight formula for chapter at position i (0-indexed from oldest):
 *   weight = 1 + (i / totalCovered)^0.5 * 3
 *
 * So if 10 chapters covered:
 *   Ch.1 (oldest): weight ≈ 1.0
 *   Ch.5 (middle): weight ≈ 2.1
 *   Ch.10 (newest): weight ≈ 4.0
 *
 * This ensures even the oldest chapter has ~25% the chance of the newest.
 */
function selectRevisionChapters(coveredChapters, maxPick = 4) {
    if (coveredChapters.length <= maxPick) return [...coveredChapters];

    const total = coveredChapters.length;

    // Assign weights — higher index = more recent = higher weight
    const weighted = coveredChapters.map((ch, i) => ({
        chapter: ch,
        weight: 1 + Math.sqrt(i / total) * 3,
    }));

    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

    // Weighted random selection without replacement
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

/**
 * Build Gemini prompt for Sunday revision tasks.
 */
function buildSundayRevisionPrompt({ courseName, creditWeight, chaptersToRevise, allCoveredCount }) {
    const chapterList = chaptersToRevise.map((c) => `  Ch.${c.number}: "${c.title}"`).join('\n');
    const isFullRevision = chaptersToRevise.length <= 5;

    return `You are an AI study assistant for "Focus Enhancer".
It's SUNDAY REVISION DAY. Generate spaced-repetition revision tasks.

## Context
- Course: ${courseName} (credits: ${creditWeight}/10)
- Total chapters studied so far: ${allCoveredCount}
- Chapters to revise today:
${chapterList}
- Revision type: ${isFullRevision ? 'FULL (covering all studied chapters)' : `PARTIAL (${chaptersToRevise.length} of ${allCoveredCount} chapters, spaced-repetition weighted)`}

## RULES
1. Generate ${isFullRevision ? 'one task per chapter' : '3-4 tasks total'} (mix across the listed chapters).
2. Tasks should test RETENTION, not teach new material:
   - "Without looking at notes, solve..."
   - "Derive the formula for... from memory"
   - "Compare and contrast X from Ch.A with Y from Ch.B"
   - "Explain in your own words why..."
3. Mix difficulty: some quick-recall (easy) + some deep application (hard).
4. Cross-chapter connections are excellent for revision.
5. Each task ≤ 3 hours (it's Sunday — lighter workload).
6. Prefix ALL titles with "[REVISION]".

## Output Format
JSON array only:
[{"title":"[REVISION] ...","description":"","topic":"","type":"reading|writing|coding|quiz|project","difficulty":"easy|medium|hard","durationHours":0,"chapterNumber":0}]`;
}

/**
 * Generate Sunday revision tasks for a SINGLE student-course pair.
 */
export async function generateSundayRevisionForCourse(course) {
    if (!course.chapters?.length) return [];

    // Chapters covered so far (0..currentChapterIndex - 1 are done)
    const coveredCount = Math.min(course.currentChapterIndex || 0, course.chapters.length);
    if (coveredCount === 0) {
        console.log(`  ⏭️  ${course.title}: no chapters covered yet, skipping revision`);
        return [];
    }

    const coveredChapters = course.chapters.slice(0, coveredCount);

    // Select chapters using spaced repetition weighting
    const chaptersToRevise = selectRevisionChapters(coveredChapters,
        coveredCount <= 5 ? coveredCount : 4);

    console.log(`  📖 ${course.title}: Sunday revision for ${chaptersToRevise.length} of ${coveredCount} chapters`);

    const prompt = buildSundayRevisionPrompt({
        courseName: course.title,
        creditWeight: course.creditWeight,
        chaptersToRevise,
        allCoveredCount: coveredCount,
    });

    const raw = await generateContent(prompt, 'Sunday revision');
    const aiTasks = parseJSON(raw);
    if (!Array.isArray(aiTasks)) throw new Error('AI did not return array');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Create announcement for this revision day
    const announcement = await Announcement.create({
        course: course._id,
        eventType: 'lecture',
        title: `Sunday Revision: ${chaptersToRevise.map((c) => `Ch.${c.number}`).join(', ')}`,
        topics: chaptersToRevise.map((c) => c.title),
        eventDate: today,
        description: `Auto-generated Sunday revision (spaced repetition). Covering ${chaptersToRevise.length} chapters.`,
        anonymous: true,
        createdBy: course.courseRep || course.enrolledStudents?.[0] || '000000000000000000000000',
        tasksGenerated: true,
    });

    const weightFactor = Math.max(1, Math.min(10, course.creditWeight)) / 5;

    const tasks = aiTasks.map((t, idx) => {
        const difficulty = ['easy', 'medium', 'hard'].includes(t.difficulty?.toLowerCase())
            ? t.difficulty.toLowerCase() : 'medium';

        const tokenStake = Math.round((BASE_STAKES[difficulty] || 10) * weightFactor);

        // Find the chapter this task references
        const chNum = t.chapterNumber || chaptersToRevise[idx % chaptersToRevise.length]?.number;
        const chTitle = course.chapters.find((c) => c.number === chNum)?.title || '';

        const title = t.title?.startsWith('[REVISION]')
            ? t.title
            : `[REVISION] ${t.title}`;

        return {
            title,
            description: t.description,
            topic: t.topic || chTitle,
            type: t.type || 'quiz',
            difficulty,
            tokenStake,
            reward: tokenStake,
            urgencyMultiplier: 1.0,
            durationHours: Math.min(t.durationHours || 2, 3),
            deadline: today, // due today (Sunday)
            scheduledDate: today,
            passNumber: 2, // revision
            isRevision: true,
            dayIndex: 6, // Sunday = day 6 of the week
            chapterRef: { number: chNum, title: chTitle },
            source: 'sunday_revision',
            course: course._id,
            announcement: announcement._id,
            aiGenerated: true,
            generationContext: {
                courseName: course.title,
                creditWeight: course.creditWeight,
                eventType: 'sunday-revision',
                urgency: 'normal',
            },
        };
    });

    const inserted = await Task.insertMany(tasks);
    console.log(`  ✅ ${course.title}: ${inserted.length} Sunday revision tasks`);
    return inserted;
}

// ════════════════════════════════════════════════════════════════════
//  CRON ENTRY POINTS
// ════════════════════════════════════════════════════════════════════

/**
 * MONDAY CRON: Check all courses for weekly chapter task generation.
 * Runs every Monday at 6 AM.
 */
export async function runWeeklyFallbackCheck() {
    console.log('\n🔄 Running weekly chapter task generation (Monday)...\n');

    const courses = await Course.find({ bookPdfPath: { $ne: null } });
    if (!courses.length) {
        console.log('  No courses with book PDFs found.');
        return;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5);

    for (const course of courses) {
        try {
            // Skip if course has recent CR announcements
            const recentAnnouncement = await Announcement.findOne({
                course: course._id,
                createdAt: { $gte: thirtyDaysAgo },
                description: { $not: /Auto-generated/ },
            });

            if (recentAnnouncement) {
                console.log(`  ✅ ${course.title}: has recent CR announcements, skipping`);
                continue;
            }

            await generateWeeklyChapterTasks(course);
        } catch (err) {
            console.error(`  ❌ ${course.title}: weekly gen failed: ${err.message}`);
        }
    }

    console.log('\n🔄 Weekly chapter task generation complete.\n');
}

/**
 * SUNDAY CRON: Generate revision tasks for each student.
 * For each student, pick ONE course (rotating), generate revision tasks.
 * Runs every Sunday at 6 AM.
 *
 * Rotation: student.sundayRevisionCourseIndex cycles through their
 * enrolledCourses. Each Sunday, a different course is picked.
 * With ≤7 courses and 4 Sundays/month, each course gets reviewed
 * roughly every 1-2 weeks.
 */
export async function runSundayRevision() {
    console.log('\n📅 Running Sunday revision task generation...\n');

    // Find all students with at least one enrolled course
    const students = await User.find({
        role: { $in: ['student', 'cr'] },
        enrolledCourses: { $exists: true, $not: { $size: 0 } },
    }).populate('enrolledCourses');

    if (!students.length) {
        console.log('  No students with enrolled courses found.');
        return;
    }

    // Track which courses we've already generated revision tasks for today
    // (avoid duplicate task generation if multiple students share a course)
    const processedCourses = new Set();

    for (const student of students) {
        try {
            const courses = student.enrolledCourses.filter((c) => c.bookPdfPath);
            if (!courses.length) {
                console.log(`  ⏭️  ${student.name}: no courses with books`);
                continue;
            }

            // Pick the course for this Sunday (rotating index)
            const idx = (student.sundayRevisionCourseIndex || 0) % courses.length;
            const course = courses[idx];

            console.log(`  👤 ${student.name}: Sunday revision → ${course.title}`);

            // Only generate tasks once per course per Sunday
            const courseKey = course._id.toString();
            if (!processedCourses.has(courseKey)) {
                await generateSundayRevisionForCourse(course);
                processedCourses.add(courseKey);
            } else {
                console.log(`    (tasks already generated for ${course.title} today)`);
            }

            // Advance the rotation index for next Sunday
            student.sundayRevisionCourseIndex = (idx + 1) % courses.length;
            await student.save();
        } catch (err) {
            console.error(`  ❌ ${student.name}: Sunday revision failed: ${err.message}`);
        }
    }

    console.log(`\n📅 Sunday revision complete. Processed ${processedCourses.size} courses.\n`);
}

// ── Backward compatibility alias ───────────────────────────────────
export const runFallbackCheck = runWeeklyFallbackCheck;
export const generateFallbackTasks = generateWeeklyChapterTasks;
