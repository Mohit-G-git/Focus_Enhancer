import { chatCompletion } from './geminiClient.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Task from '../models/Task.js';
import QuizAttempt from '../models/QuizAttempt.js';
import Conversation from '../models/Conversation.js';

/**
 * ============================================================
 *  CHATBOT SERVICE — Personalized Student Companion
 * ============================================================
 *
 *  A Gemini-powered conversational AI that:
 *
 *  1. ACADEMIC HELP
 *     - Explains concepts from their enrolled courses
 *     - Solves doubts with step-by-step breakdowns
 *     - References their textbook chapters
 *     - Suggests what to study next based on schedule
 *
 *  2. EMOTIONAL SUPPORT
 *     - Detects stress, anxiety, frustration from messages
 *     - Provides empathetic, non-clinical support
 *     - Suggests breaks, breathing exercises, perspective
 *     - Celebrates wins (quiz passes, streaks, milestones)
 *     - Knows when to recommend professional help
 *
 *  3. STUDY COACHING
 *     - Tracks their progress (tokens, quizzes, tasks done)
 *     - Gives personalized tips based on weak areas
 *     - Motivates with their own data ("You've passed 8/10!")
 *     - Helps plan study sessions
 *
 *  Context is built LIVE from the student's DB data on each
 *  message, so the bot always has up-to-date info.
 *
 * ============================================================
 */

const MAX_HISTORY_TOKENS = 30; // max messages to send as context

// ── Student Context Builder ────────────────────────────────────────

/**
 * Fetches the student's live data and builds a rich context string
 * that the chatbot uses to personalize responses.
 */
async function buildStudentContext(userId) {
    const user = await User.findById(userId).populate('enrolledCourses');
    if (!user) return { context: '', user: null };

    // Basic profile
    const lines = [
        `## Student Profile`,
        `- Name: ${user.name}`,
        `- Role: ${user.role}`,
        `- Token Balance: ${user.tokenBalance} tokens`,
        `- Reputation: ${user.reputation}`,
        `- Streak: ${user.streak?.currentDays || 0} days (longest: ${user.streak?.longestStreak || 0})`,
        `- Department: ${user.department || 'not set'}`,
        `- Semester: ${user.semester || 'not set'}`,
    ];

    // Stats summary
    if (user.stats) {
        lines.push('');
        lines.push('## Performance Stats');
        lines.push(`- Tasks completed: ${user.stats.tasksCompleted || 0}`);
        lines.push(`- Quizzes: ${user.stats.quizzesPassed || 0}/${user.stats.quizzesTaken || 0} passed`);
        lines.push(`- Average MCQ score: ${user.stats.avgMcqScore || 0}/12`);
        lines.push(`- Tokens earned: ${user.stats.tokensEarned || 0}, lost: ${user.stats.tokensLost || 0}`);
    }
    lines.push('');

    // Enrolled courses
    if (user.enrolledCourses?.length) {
        lines.push(`## Enrolled Courses (${user.enrolledCourses.length})`);
        for (const course of user.enrolledCourses) {
            const totalChapters = course.chapters?.length || 0;
            const coveredChapters = course.currentChapterIndex || 0;
            const progress = totalChapters > 0
                ? `${coveredChapters}/${totalChapters} chapters (${Math.round(coveredChapters / totalChapters * 100)}%)`
                : 'no chapters tracked';
            lines.push(`- ${course.title} (${course.creditWeight} credits, ${course.durationType}) — ${progress}`);
        }
        lines.push('');
    }

    // Today's tasks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysTasks = await Task.find({
        course: { $in: user.enrolledCourses?.map((c) => c._id) || [] },
        scheduledDate: { $gte: today, $lt: tomorrow },
    }).populate('course', 'title');

    if (todaysTasks.length) {
        lines.push(`## Today's Tasks (${todaysTasks.length})`);
        for (const t of todaysTasks) {
            lines.push(`- [${t.difficulty}] "${t.title}" (${t.course?.title}) — ${t.tokenStake} tokens, ${t.isRevision ? 'REVISION' : 'new'}`);
        }
        lines.push('');
    }

    // Recent quiz performance (last 10)
    const recentQuizzes = await QuizAttempt.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('task', 'title topic difficulty');

    if (recentQuizzes.length) {
        const passed = recentQuizzes.filter((q) => q.mcqPassed).length;
        const failed = recentQuizzes.filter((q) => q.mcqPassed === false).length;
        const pending = recentQuizzes.filter((q) => q.mcqPassed === null).length;

        lines.push(`## Recent Quiz Performance (last ${recentQuizzes.length})`);
        lines.push(`- Passed: ${passed}, Failed: ${failed}, In-progress: ${pending}`);
        lines.push(`- Pass rate: ${recentQuizzes.length > 0 ? Math.round(passed / (passed + failed || 1) * 100) : 0}%`);

        // Show last 3 in detail
        for (const q of recentQuizzes.slice(0, 3)) {
            const status = q.mcqPassed ? '✅ PASSED' : q.mcqPassed === false ? '❌ FAILED' : '⏳ in-progress';
            lines.push(`  - "${q.task?.title}" (${q.task?.topic}) → ${status} (${q.mcqScore}/12)`);
        }
        lines.push('');
    }

    // Upcoming deadlines (next 7 days)
    const nextWeek = new Date(Date.now() + 7 * 864e5);
    const upcomingTasks = await Task.find({
        course: { $in: user.enrolledCourses?.map((c) => c._id) || [] },
        deadline: { $gte: new Date(), $lte: nextWeek },
    }).sort({ deadline: 1 }).limit(5);

    if (upcomingTasks.length) {
        lines.push(`## Upcoming Deadlines (next 7 days)`);
        for (const t of upcomingTasks) {
            const daysLeft = Math.ceil((t.deadline - Date.now()) / 864e5);
            lines.push(`- "${t.title}" — ${daysLeft} days left, ${t.tokenStake} tokens`);
        }
        lines.push('');
    }

    return { context: lines.join('\n'), user };
}

// ── System Prompt Builder ──────────────────────────────────────────

function buildSystemPrompt(studentContext, conversationCategory, mood) {
    return `You are "Focus Buddy" — the personal AI companion inside Focus Enhancer, an academic platform for university students.

## YOUR PERSONALITY
- Warm, encouraging, and genuinely caring — like a smart friend who happens to be great at everything
- You use casual, relatable language (not robotic or overly formal)
- You celebrate small wins enthusiastically
- You're honest but never harsh — you frame struggles as opportunities
- You use emojis sparingly but naturally 😊
- You're concise — students are busy. Get to the point, then elaborate if asked

## YOUR CAPABILITIES

### 1. ACADEMIC HELP & DOUBT SOLVING
- Explain any concept step-by-step, from first principles
- Solve problems showing full working (math, code, theory)
- Break down complex topics into digestible chunks
- Give examples, analogies, and mnemonics
- Reference the student's specific courses and chapters when possible
- If they ask about a topic in their enrolled courses, connect it to their syllabus

### 2. EMOTIONAL SUPPORT & WELLBEING
- If the student seems stressed, anxious, sad, or frustrated:
  * Acknowledge their feelings first ("That sounds really tough")
  * Validate them ("It's completely normal to feel this way during exams")
  * Offer practical, small steps (not generic advice)
  * Suggest breaks, breathing exercises, or a change of scenery when appropriate
  * Remind them of their wins (use their quiz data, streak, tokens)
- If they mention serious topics (self-harm, severe depression, suicidal thoughts):
  * Be compassionate and take them seriously
  * ALWAYS recommend professional help: campus counseling, helplines
  * Never try to be a therapist — you're a supportive friend
  * Provide: "If you're in crisis, please reach out to your campus counseling center or a helpline like 988 (US), iCall (India: 9152987821), or your local equivalent"
- Celebrate achievements: "You passed 8 out of 10 quizzes! That's amazing!"

### 3. STUDY COACHING
- Help them plan study sessions based on their schedule
- Identify weak areas from their quiz performance
- Suggest what to tackle next based on today's tasks and deadlines
- Motivate with their own data — make it personal
- Help with time management and productivity tips

## CURRENT STUDENT DATA
${studentContext}

## CONVERSATION CONTEXT
- Category: ${conversationCategory || 'general'}
- Detected mood: ${mood || 'unknown'}

## RULES
1. NEVER reveal you have access to their data unless it's naturally relevant. Weave it in organically.
2. If they ask something outside your knowledge, say so honestly. Don't hallucinate.
3. For code: use proper formatting with language tags.
4. For math: show step-by-step working.
5. Keep responses under 500 words unless the student asks for detail.
6. If the conversation shifts between academic and emotional, adapt fluidly.
7. NEVER share other students' data or compare students.
8. You can suggest they attempt specific tasks or quizzes you see in their schedule.
9. When solving doubts, ask clarifying questions if the query is ambiguous.
10. Always end emotional support responses with something forward-looking or actionable.`;
}

// ── Mood & Category Detection ──────────────────────────────────────

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

// ── Title Generator ────────────────────────────────────────────────

function generateTitle(firstMessage) {
    // Extract a short title from the first message
    const cleaned = firstMessage.replace(/[^\w\s]/g, '').trim();
    if (cleaned.length <= 40) return cleaned || 'New Conversation';

    // Take first meaningful sentence or phrase
    const firstSentence = firstMessage.split(/[.!?\n]/)[0].trim();
    if (firstSentence.length <= 50) return firstSentence;

    return firstSentence.substring(0, 47) + '...';
}

// ── Main Chat Function ─────────────────────────────────────────────

/**
 * Process a user message and return the assistant's response.
 *
 * @param {string} userId       - The student's user ID
 * @param {string} message      - The user's message
 * @param {string} conversationId - Existing conversation ID (null for new)
 * @returns {Object} { response, conversationId, mood, category }
 */
export async function chat(userId, message, conversationId = null) {
    // 1. Build personalized student context
    const { context: studentContext, user } = await buildStudentContext(userId);
    if (!user) throw new Error('User not found');

    // 2. Find or create conversation
    let conversation;
    if (conversationId) {
        conversation = await Conversation.findOne({ _id: conversationId, user: userId });
        if (!conversation) throw new Error('Conversation not found');
    }

    if (!conversation) {
        conversation = await Conversation.create({
            user: userId,
            title: generateTitle(message),
            messages: [],
        });
    }

    // 3. Detect mood & category from current message
    const mood = detectMood(message);
    const category = detectCategory(message);

    // Update conversation metadata
    conversation.mood = mood;
    if (category !== 'general') conversation.category = category;

    // Save mood to user's wellbeing history (non-neutral only)
    if (mood !== 'neutral') {
        user.addMoodEntry(mood);
    }
    user.wellbeing = user.wellbeing || {};
    user.wellbeing.lastChatAt = new Date();
    await user.save();

    // 4. Add user message to conversation
    conversation.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
    });

    // 5. Build chat history (trim to last N messages for token efficiency)
    const recentMessages = conversation.messages.slice(-MAX_HISTORY_TOKENS);

    // Filter out system messages for the Gemini chat, keep user/assistant
    const chatHistory = recentMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

    // Ensure history starts with a user message (Gemini requirement)
    while (chatHistory.length > 0 && chatHistory[0].role !== 'user') {
        chatHistory.shift();
    }

    // 6. Build system prompt with live student data
    const systemPrompt = buildSystemPrompt(studentContext, conversation.category, mood);

    // 7. Call Gemini (shared client with 10s throttle)
    const response = await chatCompletion(systemPrompt, chatHistory, 'Chatbot');

    // 8. Save assistant response
    conversation.messages.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
    });

    // Update title if it was the first message
    if (conversation.messages.filter((m) => m.role === 'user').length === 1) {
        conversation.title = generateTitle(message);
    }

    await conversation.save();

    return {
        response,
        conversationId: conversation._id,
        title: conversation.title,
        mood,
        category: conversation.category,
    };
}

/**
 * Get a conversation with full message history.
 */
export async function getConversation(userId, conversationId) {
    const conversation = await Conversation.findOne({
        _id: conversationId,
        user: userId,
    }).populate('relatedCourse', 'title');

    if (!conversation) throw new Error('Conversation not found');
    return conversation;
}

/**
 * List all conversations for a user (most recent first).
 */
export async function listConversations(userId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;

    const conversations = await Conversation.find({ user: userId, isActive: true })
        .select('title category mood updatedAt createdAt messages')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    // Add message count and last message preview
    return conversations.map((c) => ({
        _id: c._id,
        title: c.title,
        category: c.category,
        mood: c.mood,
        messageCount: c.messages?.length || 0,
        lastMessage: c.messages?.length
            ? {
                role: c.messages[c.messages.length - 1].role,
                preview: c.messages[c.messages.length - 1].content.substring(0, 100),
                timestamp: c.messages[c.messages.length - 1].timestamp,
            }
            : null,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
    }));
}

/**
 * Delete (soft-delete) a conversation.
 */
export { detectMood, detectCategory, generateTitle };

export async function deleteConversation(userId, conversationId) {
    const conversation = await Conversation.findOneAndUpdate(
        { _id: conversationId, user: userId },
        { isActive: false },
        { returnDocument: 'after' }
    );
    if (!conversation) throw new Error('Conversation not found');
    return { deleted: true };
}
