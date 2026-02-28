import "dotenv/config";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "./modules/users/user.model.js";
import Task from "./modules/tasks/task.model.js";

const seed = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Clean existing data
    await User.deleteMany({});
    await Task.deleteMany({});
    await mongoose.connection.db.collection("submissions").deleteMany({});
    await mongoose.connection.db.collection("votes").deleteMany({});

    // Create test users
    const hashedPassword = await bcrypt.hash("password123", 10);

    const user1 = await User.create({
        name: "Alice Student",
        email: "alice@test.com",
        password: hashedPassword,
        role: "student",
    });

    const user2 = await User.create({
        name: "Bob Student",
        email: "bob@test.com",
        password: hashedPassword,
        role: "student",
    });

    const admin = await User.create({
        name: "Admin User",
        email: "admin@test.com",
        password: hashedPassword,
        role: "admin",
    });

    // Create test task
    const task = await Task.create({
        title: "Write Research Paper",
        description: "Submit a 5-page research paper on campus focus.",
    });

    // Generate JWT tokens
    const token1 = jwt.sign({ id: user1._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    const token2 = jwt.sign({ id: user2._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    const adminToken = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    console.log("\n=== TEST DATA CREATED ===\n");
    console.log(`User 1 (Alice):  ID=${user1._id}`);
    console.log(`User 2 (Bob):    ID=${user2._id}`);
    console.log(`Admin:           ID=${admin._id}`);
    console.log(`Task:            ID=${task._id}`);
    console.log(`\n--- JWT TOKENS (use as Bearer token) ---\n`);
    console.log(`ALICE_TOKEN=${token1}`);
    console.log(`BOB_TOKEN=${token2}`);
    console.log(`ADMIN_TOKEN=${adminToken}`);
    console.log(`\n--- POSTMAN TEST COMMANDS ---\n`);
    console.log(`Test 1 - Submit Task:`);
    console.log(`  POST http://localhost:5000/tasks/${task._id}/submit`);
    console.log(`  Header: Authorization: Bearer <ALICE_TOKEN>`);
    console.log(`  Body: form-data, key=pdf, type=file, value=<any .pdf file>`);
    console.log(`\nTest 2 - Vote (use Bob's token to vote on Alice's submission):`);
    console.log(`  POST http://localhost:5000/votes/<submissionId>`);
    console.log(`  Header: Authorization: Bearer <BOB_TOKEN>`);
    console.log(`  Body: { "voteType": "upvote" }`);
    console.log(`\nTest 3 - Remove Vote:`);
    console.log(`  DELETE http://localhost:5000/votes/<submissionId>`);
    console.log(`  Header: Authorization: Bearer <BOB_TOKEN>`);
    console.log(`\nTest 4 - Approve Submission:`);
    console.log(`  PATCH http://localhost:5000/tasks/submission/<submissionId>/approve`);
    console.log(`  Header: Authorization: Bearer <ADMIN_TOKEN>`);

    await mongoose.disconnect();
    console.log("\nDone. Now run: npm run dev");
};

seed().catch(console.error);
