/**
 * seed.js — Populate the database with users, courses, enrolments, tasks,
 *            quiz attempts, theory submissions, token ledger, and user stats.
 * Run:  node seed.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import User from './src/models/User.js';
import Course from './src/models/Course.js';
import TokenLedger from './src/models/TokenLedger.js';
import Task from './src/models/Task.js';
import Announcement from './src/models/Announcement.js';
import QuizAttempt from './src/models/QuizAttempt.js';
import CourseProficiency from './src/models/CourseProficiency.js';
import TheorySubmission from './src/models/TheorySubmission.js';
import PeerReview from './src/models/PeerReview.js';
import CRComplaint from './src/models/CRComplaint.js';
import Conversation from './src/models/Conversation.js';
import DirectConversation from './src/models/DirectConversation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGO_URI = process.env.MONGO_URI;

// ── Decay formula (same as quizController) ─────────────────────
const DECAY_BASE = 0.6;
function calcDecayedStake(baseStake, attemptNumber) {
    return Math.max(1, Math.ceil(baseStake * Math.pow(DECAY_BASE, attemptNumber - 1)));
}

// ── Helper: create a dummy PDF ─────────────────────────────────
function createDummyPDF(filename) {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filePath = path.join(uploadsDir, filename);
    // Minimal valid PDF
    const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<<>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 100 700 Td (Theory Solutions) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000230 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
324
%%EOF`;
    fs.writeFileSync(filePath, pdf);
    return `uploads/${filename}`;
}

// ── Sample MCQs for seed quiz attempts ─────────────────────────
function generateFakeMCQs() {
    const templates = [
        { q: 'What is the time complexity of binary search on a sorted array of n elements?', opts: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], correct: 1 },
        { q: 'Which data structure uses FIFO ordering?', opts: ['Stack', 'Queue', 'Tree', 'Graph'], correct: 1 },
        { q: 'What is the worst-case complexity of quicksort?', opts: ['O(n log n)', 'O(n)', 'O(n²)', 'O(log n)'], correct: 2 },
        { q: 'Which traversal visits the root node first?', opts: ['Inorder', 'Postorder', 'Preorder', 'Level-order'], correct: 2 },
        { q: 'A balanced BST with n nodes has height?', opts: ['O(n)', 'O(log n)', 'O(√n)', 'O(n²)'], correct: 1 },
        { q: 'Which sorting algorithm is stable and O(n log n)?', opts: ['Quicksort', 'Heapsort', 'Merge sort', 'Selection sort'], correct: 2 },
        { q: 'What is normalization in DBMS?', opts: ['Adding redundancy', 'Removing redundancy', 'Creating indexes', 'Deleting tables'], correct: 1 },
        { q: 'Which normal form eliminates transitive dependencies?', opts: ['1NF', '2NF', '3NF', 'BCNF'], correct: 2 },
        { q: 'What does ACID stand for in transactions?', opts: ['Atomicity, Consistency, Isolation, Durability', 'Access, Control, Identity, Data', 'Attribute, Constraint, Index, Domain', 'None of these'], correct: 0 },
        { q: 'Which join returns all rows from both tables?', opts: ['Inner join', 'Left join', 'Right join', 'Full outer join'], correct: 3 },
        { q: 'What is a deadlock in OS?', opts: ['Fast process execution', 'Circular wait among processes', 'Memory overflow', 'CPU idle state'], correct: 1 },
        { q: 'Which scheduling algorithm may cause starvation?', opts: ['Round Robin', 'FCFS', 'SJF', 'All of these'], correct: 2 },
    ];
    const shuffled = [...templates].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6).map((t) => ({
        question: t.q,
        options: t.opts,
        correctAnswer: t.correct,
    }));
}

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // ─── Clear existing data ───────────────────────────────────────
    await User.deleteMany({});
    await Course.deleteMany({});
    await TokenLedger.deleteMany({});
    await Task.deleteMany({});
    await Announcement.deleteMany({});
    await QuizAttempt.deleteMany({});
    await CourseProficiency.deleteMany({});
    await TheorySubmission.deleteMany({});
    await PeerReview.deleteMany({});
    await CRComplaint.deleteMany({});
    await Conversation.deleteMany({});
    await DirectConversation.deleteMany({});

    // Drop old unique index on QuizAttempt (if it exists from previous schema)
    try {
        await mongoose.connection.collection('quizattempts').dropIndex('user_1_task_1');
        console.log('   🗑️  Dropped old unique index on quizattempts');
    } catch { /* index doesn't exist, fine */ }
    try {
        await mongoose.connection.collection('crcomplaints').dropIndex('complainant_1_course_1_status_1');
        console.log('   🗑️  Dropped old complaint index');
    } catch { /* index doesn't exist, fine */ }

    console.log('🗑️  Cleared all collections');

    // ─── Users ─────────────────────────────────────────────────────
    const rawPassword = 'password123';
    const usersData = [
        { name: 'Gokul Krishnan', email: 'gokul@iitj.ac.in', department: 'CSE', semester: 4, year: 2026, university: 'IIT Jodhpur', studentId: 'B22CS001', role: 'cr' },
        { name: 'Arjun Mehta', email: 'arjun@iitj.ac.in', department: 'CSE', semester: 4, year: 2026, university: 'IIT Jodhpur', studentId: 'B22CS002' },
        { name: 'Priya Sharma', email: 'priya@iitj.ac.in', department: 'CSE', semester: 4, year: 2026, university: 'IIT Jodhpur', studentId: 'B22CS003' },
        { name: 'Ravi Kumar', email: 'ravi@iitj.ac.in', department: 'EE', semester: 4, year: 2026, university: 'IIT Jodhpur', studentId: 'B22EE001' },
        { name: 'Sneha Reddy', email: 'sneha@iitj.ac.in', department: 'EE', semester: 4, year: 2026, university: 'IIT Jodhpur', studentId: 'B22EE002' },
        { name: 'Vikram Singh', email: 'vikram@iitj.ac.in', department: 'ME', semester: 6, year: 2026, university: 'IIT Jodhpur', studentId: 'B21ME001' },
        { name: 'Ananya Patel', email: 'ananya@iitj.ac.in', department: 'CSE', semester: 2, year: 2026, university: 'IIT Jodhpur', studentId: 'B23CS001' },
        { name: 'Karthik Nair', email: 'karthik@iitj.ac.in', department: 'CSE', semester: 4, year: 2026, university: 'IIT Jodhpur', studentId: 'B22CS004' },
        { name: 'Divya Iyer', email: 'divya@iitj.ac.in', department: 'CSE', semester: 4, year: 2026, university: 'IIT Jodhpur', studentId: 'B22CS005' },
        { name: 'Rohan Deshmukh', email: 'rohan@iitj.ac.in', department: 'EE', semester: 6, year: 2026, university: 'IIT Jodhpur', studentId: 'B21EE001' },
    ];

    const users = [];
    for (const ud of usersData) {
        const user = await User.create({ ...ud, passwordHash: rawPassword, role: ud.role || 'student' });
        await TokenLedger.create({ userId: user._id, type: 'initial', amount: 100, balanceAfter: 100, note: 'Welcome bonus: 100 tokens' });
        users.push(user);
        console.log(`   👤 ${user.name} (${user.email}) — ${user.role}`);
    }

    // ─── Courses ───────────────────────────────────────────────────
    const coursesData = [
        { courseCode: 'CS201', title: 'Data Structures & Algorithms', department: 'CSE', semester: 4, year: 2026, creditWeight: 4, durationType: 'full', instructor: 'Dr. Anil Verma', syllabus: 'Arrays, Linked Lists, Trees, Graphs, Sorting, Hashing, Dynamic Programming' },
        { courseCode: 'CS202', title: 'Database Management Systems', department: 'CSE', semester: 4, year: 2026, creditWeight: 4, durationType: 'full', instructor: 'Dr. Priya Gupta', syllabus: 'ER Model, Relational Algebra, SQL, Normalization, Transactions, Indexing' },
        { courseCode: 'CS203', title: 'Operating Systems', department: 'CSE', semester: 4, year: 2026, creditWeight: 3, durationType: 'full', instructor: 'Dr. Rajeev Mohan', syllabus: 'Process Management, Scheduling, Memory Management, File Systems, Deadlocks' },
        { courseCode: 'CS204', title: 'Computer Networks', department: 'CSE', semester: 4, year: 2026, creditWeight: 3, durationType: 'full', instructor: 'Dr. Sunita Das', syllabus: 'OSI Model, TCP/IP, Routing, HTTP, DNS, Security, Wireless Networks' },
        { courseCode: 'CS301', title: 'Machine Learning', department: 'CSE', semester: 6, year: 2026, creditWeight: 4, durationType: 'full', instructor: 'Dr. Kavita Rao', syllabus: 'Regression, Classification, Neural Networks, SVM, Clustering, PCA' },
        { courseCode: 'EE201', title: 'Signals & Systems', department: 'EE', semester: 4, year: 2026, creditWeight: 4, durationType: 'full', instructor: 'Dr. Amit Joshi', syllabus: 'Fourier Series, LTI Systems, Laplace Transform, Z-Transform, Sampling' },
        { courseCode: 'EE202', title: 'Analog Electronics', department: 'EE', semester: 4, year: 2026, creditWeight: 3, durationType: 'full', instructor: 'Dr. Neha Kapoor', syllabus: 'Diodes, BJT, FET, Op-Amp, Oscillators, Power Amplifiers' },
        { courseCode: 'ME201', title: 'Thermodynamics', department: 'ME', semester: 6, year: 2026, creditWeight: 3, durationType: 'full', instructor: 'Dr. Sanjay Thakur', syllabus: 'Laws of Thermodynamics, Entropy, Carnot Cycle, Gas Mixtures, Combustion' },
        { courseCode: 'MA201', title: 'Probability & Statistics', department: 'CSE', semester: 4, year: 2026, creditWeight: 3, durationType: 'full', instructor: 'Dr. Ramesh Iyer', syllabus: 'Probability, Random Variables, Distributions, Hypothesis Testing, Regression' },
        { courseCode: 'CS101', title: 'Introduction to Programming', department: 'CSE', semester: 2, year: 2026, creditWeight: 4, durationType: 'full', instructor: 'Dr. Pankaj Mishra', syllabus: 'Variables, Control Flow, Functions, Arrays, Pointers, OOP Basics' },
    ];

    const courses = [];
    for (const cd of coursesData) {
        const course = await Course.create(cd);
        courses.push(course);
        console.log(`   📚 ${course.courseCode} — ${course.title}`);
    }

    // ─── Assign CRs ───────────────────────────────────────────────
    const crAssignments = [
        { user: users[0], course: courses[0] },
        { user: users[1], course: courses[1] },
        { user: users[3], course: courses[5] },
    ];
    for (const { user, course } of crAssignments) {
        course.courseRep = user._id;
        course.enrolledStudents.push(user._id);
        await course.save();
        if (user.role === 'student') { user.role = 'cr'; }
        if (!user.enrolledCourses.includes(course._id)) { user.enrolledCourses.push(course._id); }
        await user.save();
        console.log(`   🎖️  ${user.name} → CR of ${course.courseCode}`);
    }

    // ─── Enrolments ────────────────────────────────────────────────
    const enrolments = [
        { userIdx: [0, 1, 2, 7, 8], courseIdx: [0, 1, 2, 3, 8] },
        { userIdx: [3, 4], courseIdx: [5, 6] },
        { userIdx: [5], courseIdx: [4] },
        { userIdx: [5], courseIdx: [7] },
        { userIdx: [6], courseIdx: [9] },
    ];
    for (const { userIdx, courseIdx } of enrolments) {
        for (const ui of userIdx) {
            for (const ci of courseIdx) {
                const u = users[ui]; const c = courses[ci];
                if (!c.enrolledStudents.some((s) => s.toString() === u._id.toString())) { c.enrolledStudents.push(u._id); await c.save(); }
                if (!u.enrolledCourses.some((ec) => ec.toString() === c._id.toString())) { u.enrolledCourses.push(c._id); await u.save(); }
            }
        }
    }
    console.log('   ✅ Enrolments complete');

    // ─── Announcements ─────────────────────────────────────────────
    const announcementsData = [
        { title: 'DSA Midterm Exam', courseIdx: 0, crIdx: 0, eventType: 'midterm', topics: ['Trees', 'Graphs', 'Dynamic Programming', 'Sorting'], daysFromNow: 14 },
        { title: 'DBMS Quiz 1', courseIdx: 1, crIdx: 1, eventType: 'quiz', topics: ['SQL', 'Normalization'], daysFromNow: 7 },
        { title: 'OS Assignment: CPU Scheduling', courseIdx: 2, crIdx: 0, eventType: 'assignment', topics: ['CPU Scheduling', 'Process Synchronization'], daysFromNow: 10 },
        { title: 'Networks Lab: Socket Programming', courseIdx: 3, crIdx: 0, eventType: 'lab', topics: ['TCP Sockets', 'UDP'], daysFromNow: 5 },
        { title: 'Signals Midterm', courseIdx: 5, crIdx: 3, eventType: 'midterm', topics: ['Fourier Transform', 'Laplace Transform', 'Z-Transform'], daysFromNow: 12 },
    ];

    const announcements = [];
    for (const ad of announcementsData) {
        const eventDate = new Date(); eventDate.setDate(eventDate.getDate() + ad.daysFromNow);
        const ann = await Announcement.create({
            title: ad.title,
            course: courses[ad.courseIdx]._id,
            createdBy: users[ad.crIdx]._id,
            eventType: ad.eventType,
            topics: ad.topics,
            eventDate,
            description: `Prepare for ${ad.title}. Topics: ${ad.topics.join(', ')}.`,
        });
        announcements.push(ann);
        console.log(`   📢 ${ann.title} (${ad.eventType})`);
    }

    // ─── Tasks ─────────────────────────────────────────────────────
    const BASE_STAKES = { easy: 5, medium: 10, hard: 20 };
    const taskTemplates = [
        // DSA Tasks (idx 0–5)
        { title: 'Binary Search Tree Operations', topic: 'Trees', difficulty: 'medium', type: 'coding', annIdx: 0, courseIdx: 0, daysOffset: 0 },
        { title: 'Graph BFS & DFS Implementation', topic: 'Graphs', difficulty: 'hard', type: 'coding', annIdx: 0, courseIdx: 0, daysOffset: 1 },
        { title: 'Dynamic Programming: Knapsack', topic: 'Dynamic Programming', difficulty: 'hard', type: 'coding', annIdx: 0, courseIdx: 0, daysOffset: 2 },
        { title: 'Merge Sort Analysis', topic: 'Sorting', difficulty: 'easy', type: 'reading', annIdx: 0, courseIdx: 0, daysOffset: 3 },
        { title: 'AVL Tree Rotations', topic: 'Trees', difficulty: 'medium', type: 'quiz', annIdx: 0, courseIdx: 0, daysOffset: 4 },
        { title: 'Dijkstra\'s Algorithm', topic: 'Graphs', difficulty: 'hard', type: 'coding', annIdx: 0, courseIdx: 0, daysOffset: 5 },
        // DBMS Tasks (idx 6–8)
        { title: 'SQL Joins Practice', topic: 'SQL', difficulty: 'easy', type: 'quiz', annIdx: 1, courseIdx: 1, daysOffset: 0 },
        { title: 'Normalization to 3NF', topic: 'Normalization', difficulty: 'medium', type: 'writing', annIdx: 1, courseIdx: 1, daysOffset: 1 },
        { title: 'ER Diagram Design', topic: 'SQL', difficulty: 'medium', type: 'project', annIdx: 1, courseIdx: 1, daysOffset: 2 },
        // OS Tasks (idx 9–11)
        { title: 'Round Robin Scheduling', topic: 'CPU Scheduling', difficulty: 'medium', type: 'coding', annIdx: 2, courseIdx: 2, daysOffset: 0 },
        { title: 'Semaphore Implementation', topic: 'Process Synchronization', difficulty: 'hard', type: 'coding', annIdx: 2, courseIdx: 2, daysOffset: 1 },
        { title: 'Priority Scheduling Comparison', topic: 'CPU Scheduling', difficulty: 'easy', type: 'reading', annIdx: 2, courseIdx: 2, daysOffset: 2 },
        // Networks Tasks (idx 12–13)
        { title: 'TCP Client-Server', topic: 'TCP Sockets', difficulty: 'medium', type: 'coding', annIdx: 3, courseIdx: 3, daysOffset: 0 },
        { title: 'UDP Echo Server', topic: 'UDP', difficulty: 'easy', type: 'coding', annIdx: 3, courseIdx: 3, daysOffset: 1 },
        // Signals Tasks (idx 14–15)
        { title: 'Fourier Transform Properties', topic: 'Fourier Transform', difficulty: 'medium', type: 'reading', annIdx: 4, courseIdx: 5, daysOffset: 0 },
        { title: 'Laplace Transform Problems', topic: 'Laplace Transform', difficulty: 'hard', type: 'writing', annIdx: 4, courseIdx: 5, daysOffset: 1 },
    ];

    const tasks = [];
    for (const tt of taskTemplates) {
        const scheduledDate = new Date(); scheduledDate.setDate(scheduledDate.getDate() + tt.daysOffset);
        const deadline = new Date(announcements[tt.annIdx].eventDate);
        const baseStake = BASE_STAKES[tt.difficulty];
        const creditWeight = courses[tt.courseIdx].creditWeight;
        const stake = Math.ceil(baseStake * creditWeight / 5);
        const reward = Math.ceil(stake * 1.5);

        const task = await Task.create({
            title: tt.title,
            description: `Study and practice: ${tt.title}. ${tt.topic} is a key topic.`,
            topic: tt.topic, type: tt.type, difficulty: tt.difficulty,
            tokenStake: stake, reward, urgencyMultiplier: 1.25,
            durationHours: tt.difficulty === 'easy' ? 0.5 : tt.difficulty === 'medium' ? 1 : 1.5,
            deadline, scheduledDate, passNumber: 1,
            course: courses[tt.courseIdx]._id,
            announcement: announcements[tt.annIdx]._id,
            source: 'announcement', status: 'pending',
            aiGenerated: true,
            generationContext: {
                courseName: courses[tt.courseIdx].title,
                creditWeight,
                eventType: announcements[tt.annIdx].eventType,
                urgency: 'medium',
            },
        });
        tasks.push(task);
    }
    console.log(`   📝 Created ${tasks.length} tasks`);

    // ─── Quiz Attempts (simulated data) ────────────────────────────
    const attemptScenarios = [
        // Gokul: passed 3 tasks, failed 1 then re-attempted
        { userIdx: 0, taskIdx: 0, score: 10, passed: true, attempt: 1 },
        { userIdx: 0, taskIdx: 1, score: 4, passed: false, attempt: 1 },
        { userIdx: 0, taskIdx: 1, score: 9, passed: true, attempt: 2 },
        { userIdx: 0, taskIdx: 2, score: 8, passed: true, attempt: 1, withTheory: true },
        { userIdx: 0, taskIdx: 3, score: 12, passed: true, attempt: 1, withTheory: true },

        // Priya: strong performer
        { userIdx: 2, taskIdx: 0, score: 12, passed: true, attempt: 1, withTheory: true },
        { userIdx: 2, taskIdx: 1, score: 10, passed: true, attempt: 1, withTheory: true },
        { userIdx: 2, taskIdx: 2, score: 8, passed: true, attempt: 1 },
        { userIdx: 2, taskIdx: 6, score: 10, passed: true, attempt: 1, withTheory: true },
        { userIdx: 2, taskIdx: 7, score: 9, passed: true, attempt: 1 },

        // Arjun: decent, some failures
        { userIdx: 1, taskIdx: 6, score: 8, passed: true, attempt: 1, withTheory: true },
        { userIdx: 1, taskIdx: 7, score: 6, passed: false, attempt: 1 },
        { userIdx: 1, taskIdx: 7, score: 8, passed: true, attempt: 2 },
        { userIdx: 1, taskIdx: 0, score: 10, passed: true, attempt: 1 },

        // Karthik: moderate, 3 re-attempts on one task
        { userIdx: 7, taskIdx: 0, score: 8, passed: true, attempt: 1 },
        { userIdx: 7, taskIdx: 3, score: 4, passed: false, attempt: 1 },
        { userIdx: 7, taskIdx: 3, score: 2, passed: false, attempt: 2 },
        { userIdx: 7, taskIdx: 3, score: 10, passed: true, attempt: 3 },
        { userIdx: 7, taskIdx: 9, score: 10, passed: true, attempt: 1, withTheory: true },

        // Divya: good student
        { userIdx: 8, taskIdx: 0, score: 10, passed: true, attempt: 1, withTheory: true },
        { userIdx: 8, taskIdx: 4, score: 12, passed: true, attempt: 1, withTheory: true },
        { userIdx: 8, taskIdx: 6, score: 8, passed: true, attempt: 1 },

        // Ravi (EE)
        { userIdx: 3, taskIdx: 14, score: 10, passed: true, attempt: 1, withTheory: true },
        { userIdx: 3, taskIdx: 15, score: 6, passed: false, attempt: 1 },

        // Sneha (EE)
        { userIdx: 4, taskIdx: 14, score: 8, passed: true, attempt: 1 },
        { userIdx: 4, taskIdx: 15, score: 8, passed: true, attempt: 1, withTheory: true },
    ];

    let pdfCount = 0;
    for (const scenario of attemptScenarios) {
        const user = users[scenario.userIdx];
        const task = tasks[scenario.taskIdx];
        const stake = calcDecayedStake(task.tokenStake, scenario.attempt);
        const mcqs = generateFakeMCQs();

        // Generate MCQ responses to roughly match the target score
        const responses = [];
        let runningScore = 0;
        for (let i = 0; i < 6; i++) {
            let selectedAnswer, isCorrect, points;
            const needed = scenario.score - runningScore;
            const remaining = 6 - i;

            if (needed >= remaining * 2) {
                selectedAnswer = mcqs[i].correctAnswer;
                isCorrect = true; points = 2;
            } else if (runningScore >= scenario.score && remaining > 0) {
                selectedAnswer = (mcqs[i].correctAnswer + 1) % 4;
                isCorrect = false; points = -2;
            } else if (Math.random() > 0.35) {
                selectedAnswer = mcqs[i].correctAnswer;
                isCorrect = true; points = 2;
            } else {
                selectedAnswer = (mcqs[i].correctAnswer + 2) % 4;
                isCorrect = false; points = -2;
            }
            runningScore += points;
            responses.push({
                questionIndex: i, selectedAnswer,
                answeredAt: new Date(),
                timeTakenMs: 5000 + Math.floor(Math.random() * 8000),
                isCorrect, points,
            });
        }

        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 10));
        createdAt.setHours(createdAt.getHours() - scenario.attempt);

        let theoryPath = null;
        if (scenario.withTheory && scenario.passed) {
            pdfCount++;
            theoryPath = createDummyPDF(`theory_${user._id}_${task._id}_${scenario.attempt}.pdf`);
        }

        const quizAttempt = await QuizAttempt.create({
            user: user._id, task: task._id, course: task.course,
            mcqs, mcqResponses: responses,
            mcqStartedAt: createdAt,
            mcqScore: scenario.score, mcqPassed: scenario.passed,
            attemptNumber: scenario.attempt,
            effectiveStake: stake,
            status: scenario.passed ? (theoryPath ? 'submitted' : 'theory_pending') : 'failed',
            tokenSettled: true,
            tokensAwarded: scenario.passed ? task.reward : -stake,
            theoryQuestions: scenario.passed ? [
                'Explain the concept in detail.',
                'Provide a step-by-step solution.',
                'Analyze the time complexity.',
                'Compare with alternative approaches.',
                'Describe edge cases and their handling.',
                'Write pseudocode for the algorithm.',
                'Discuss real-world applications.',
            ] : [],
            theorySubmissionPath: theoryPath,
            theorySubmittedAt: theoryPath ? new Date() : null,
            createdAt,
        });

        // Create TheorySubmission document (needed for peer review system)
        if (theoryPath && scenario.passed) {
            const pdfFilename = `theory_${user._id}_${task._id}_${scenario.attempt}.pdf`;
            await TheorySubmission.create({
                student: user._id,
                task: task._id,
                quizAttempt: quizAttempt._id,
                course: task.course,
                pdf: {
                    originalName: pdfFilename,
                    storedPath: theoryPath,
                    sizeBytes: 500,
                    uploadedAt: new Date(),
                },
                aiGrading: {
                    status: 'graded',
                    totalScore: 40 + Math.floor(Math.random() * 25),
                    maxScore: 70,
                    feedback: 'Good understanding of core concepts. Well-structured answers.',
                    questionBreakdown: Array.from({ length: 7 }, (_, i) => ({
                        questionIndex: i,
                        score: 5 + Math.floor(Math.random() * 5),
                        maxScore: 10,
                        feedback: 'Adequate explanation.',
                    })),
                    gradedAt: new Date(),
                },
                tokensAwarded: task.reward,
            });
        }

        // Update user stats
        const u = await User.findById(user._id);
        u.stats.quizzesTaken = (u.stats.quizzesTaken || 0) + 1;
        if (scenario.passed) {
            u.stats.quizzesPassed = (u.stats.quizzesPassed || 0) + 1;
            u.stats.tokensEarned = (u.stats.tokensEarned || 0) + task.reward;
            u.tokenBalance += task.reward;
        } else {
            u.stats.tokensLost = (u.stats.tokensLost || 0) + stake;
            u.tokenBalance = Math.max(0, u.tokenBalance - stake);
        }
        const avgTotal = (u.stats.avgMcqScore || 0) * ((u.stats.quizzesTaken || 1) - 1) + scenario.score;
        u.stats.avgMcqScore = Math.round((avgTotal / u.stats.quizzesTaken) * 100) / 100;
        if (scenario.passed) u.stats.tasksCompleted = (u.stats.tasksCompleted || 0) + 1;
        u.recalculateReputation();
        u.streak.currentDays = Math.floor(Math.random() * 7) + 1;
        u.streak.longestStreak = Math.max(u.streak.currentDays, u.streak.longestStreak || 0);
        u.streak.lastActiveDate = new Date();
        await u.save();

        // Token ledger
        await TokenLedger.create({
            userId: u._id, taskId: task._id,
            type: scenario.passed ? 'reward' : 'penalty',
            amount: scenario.passed ? (stake + task.reward) : 0,
            balanceAfter: u.tokenBalance,
            note: scenario.passed
                ? `MCQ passed (${scenario.score}/12, attempt #${scenario.attempt}). Stake ${stake} + ${task.reward} reward.`
                : `MCQ failed (${scenario.score}/12, attempt #${scenario.attempt}). Stake ${stake} forfeited.`,
        });

        // Course proficiency
        let prof = await CourseProficiency.findOne({ user: user._id, course: task.course });
        if (!prof) prof = await CourseProficiency.create({ user: user._id, course: task.course });
        prof.tasksAttempted += 1;
        if (scenario.passed) { prof.quizzesPassed += 1; prof.tasksCompleted += 1; }
        else { prof.quizzesFailed += 1; }
        prof.recalculate();
        await prof.save();
    }
    console.log(`   🎯 Created ${attemptScenarios.length} quiz attempts (${pdfCount} with theory PDFs)`);

    // ─── Bonus tokens for variety ──────────────────────────────────
    const bonusTokens = [
        { idx: 2, bonus: 50, note: 'Bonus: Top performer week 3' },
        { idx: 0, bonus: 30, note: 'Bonus: CR contribution' },
        { idx: 8, bonus: 25, note: 'Bonus: Perfect quiz streak' },
        { idx: 7, bonus: 15, note: 'Bonus: Persistence reward (3 re-attempts)' },
    ];
    for (const bt of bonusTokens) {
        const u = await User.findById(users[bt.idx]._id);
        u.tokenBalance += bt.bonus;
        u.stats.tokensEarned += bt.bonus;
        u.recalculateReputation();
        await u.save();
        await TokenLedger.create({
            userId: u._id, type: 'bonus', amount: bt.bonus,
            balanceAfter: u.tokenBalance, note: bt.note,
        });
    }
    console.log('   💰 Added bonus tokens');

    // ─── Summary ───────────────────────────────────────────────────
    const totalUsers = await User.countDocuments();
    const totalCourses = await Course.countDocuments();
    const totalTasks = await Task.countDocuments();
    const totalAttempts = await QuizAttempt.countDocuments();
    const totalLedger = await TokenLedger.countDocuments();

    console.log(`\n🎉 Seed complete!`);
    console.log(`   ${totalUsers} users, ${totalCourses} courses, ${totalTasks} tasks`);
    console.log(`   ${totalAttempts} quiz attempts, ${totalLedger} ledger entries`);
    console.log(`   ${pdfCount} theory PDF submissions`);
    console.log('\n   Passwords: password123');
    console.log('   Login as: gokul@iitj.ac.in (CR), priya@iitj.ac.in (student - top performer)');
    console.log('   Re-attempt demo: karthik@iitj.ac.in (3 attempts on "Merge Sort Analysis")');

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed error:', err);
    process.exit(1);
});
