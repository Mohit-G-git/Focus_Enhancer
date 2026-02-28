/**
 * seed.js — Populate the database with users, courses, and enrolments.
 * Run:  node seed.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from './src/models/User.js';
import Course from './src/models/Course.js';
import TokenLedger from './src/models/TokenLedger.js';

const MONGO_URI = process.env.MONGO_URI;

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // ─── Clear existing data (optional — comment out to append) ────────
    await User.deleteMany({});
    await Course.deleteMany({});
    await TokenLedger.deleteMany({});
    console.log('🗑️  Cleared existing users, courses, ledger');

    // ─── Users ─────────────────────────────────────────────────────────
    // Pre-save hook in User model will hash passwordHash automatically
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
        const user = await User.create({
            ...ud,
            passwordHash: rawPassword,
            role: ud.role || 'student',
        });
        // Welcome bonus
        await TokenLedger.create({
            userId: user._id,
            type: 'initial',
            amount: 100,
            balanceAfter: 100,
            note: 'Welcome bonus: 100 tokens',
        });
        users.push(user);
        console.log(`   👤 ${user.name} (${user.email}) — ${user.role}`);
    }

    // ─── Courses ───────────────────────────────────────────────────────
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

    // ─── Assign CRs (anonymous to others) ──────────────────────────────
    // Gokul → CS201, Arjun → CS202, Ravi → EE201
    const crAssignments = [
        { user: users[0], course: courses[0] },  // Gokul → DSA
        { user: users[1], course: courses[1] },  // Arjun → DBMS
        { user: users[3], course: courses[5] },  // Ravi → Signals
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

    // ─── Enrolments ────────────────────────────────────────────────────
    const enrolments = [
        // CSE Sem-4 students → CS201, CS202, CS203, CS204, MA201
        { userIdx: [0, 1, 2, 7, 8], courseIdx: [0, 1, 2, 3, 8] },
        // EE Sem-4 students → EE201, EE202
        { userIdx: [3, 4], courseIdx: [5, 6] },
        // CSE Sem-6 → ML
        { userIdx: [5], courseIdx: [4] },
        // ME Sem-6 → Thermo
        { userIdx: [5], courseIdx: [7] },
        // CSE Sem-2 → Intro to Programming
        { userIdx: [6], courseIdx: [9] },
    ];

    for (const { userIdx, courseIdx } of enrolments) {
        for (const ui of userIdx) {
            for (const ci of courseIdx) {
                const u = users[ui];
                const c = courses[ci];
                if (!c.enrolledStudents.some((s) => s.toString() === u._id.toString())) {
                    c.enrolledStudents.push(u._id);
                    await c.save();
                }
                if (!u.enrolledCourses.some((ec) => ec.toString() === c._id.toString())) {
                    u.enrolledCourses.push(c._id);
                    await u.save();
                }
            }
        }
    }
    console.log('   ✅ Enrolments complete');

    // ─── Summary ───────────────────────────────────────────────────────
    const totalUsers = await User.countDocuments();
    const totalCourses = await Course.countDocuments();
    console.log(`\n🎉 Seed complete: ${totalUsers} users, ${totalCourses} courses`);
    console.log('   All passwords: password123');
    console.log('   Login as: gokul@iitj.ac.in / password123 (CR)');
    console.log('           : arjun@iitj.ac.in / password123 (CR)');
    console.log('           : priya@iitj.ac.in / password123 (student)');

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed error:', err);
    process.exit(1);
});
