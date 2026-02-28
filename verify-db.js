import "dotenv/config";
import mongoose from "mongoose";
import User from "./modules/users/user.model.js";
import Submission from "./modules/tasks/submission.model.js";
import Vote from "./modules/voting/vote.model.js";

const verify = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB\n");

    // ========== 1. Fetch all data ==========
    const votes = await Vote.find().lean();
    const submissions = await Submission.find().lean();
    const users = await User.find().select("-password").lean();

    console.log("=== db.votes.find() ===");
    console.log(JSON.stringify(votes, null, 2));

    console.log("\n=== db.submissions.find() ===");
    console.log(JSON.stringify(submissions, null, 2));

    console.log("\n=== db.users.find() ===");
    console.log(JSON.stringify(users, null, 2));

    // ========== 2. Vote count vs Submission count ==========
    console.log("\n\n========================================");
    console.log("  VERIFICATION: Vote Count Consistency");
    console.log("========================================\n");

    let voteCountErrors = 0;
    for (const sub of submissions) {
        const actualUpvotes = votes.filter(
            (v) => v.submission.toString() === sub._id.toString() && v.voteType === "upvote"
        ).length;
        const actualDownvotes = votes.filter(
            (v) => v.submission.toString() === sub._id.toString() && v.voteType === "downvote"
        ).length;

        const upMatch = sub.upvotes === actualUpvotes;
        const downMatch = sub.downvotes === actualDownvotes;

        console.log(`Submission ${sub._id}:`);
        console.log(`  upvotes:   stored=${sub.upvotes}, actual=${actualUpvotes} ${upMatch ? "✅" : "❌ MISMATCH"}`);
        console.log(`  downvotes: stored=${sub.downvotes}, actual=${actualDownvotes} ${downMatch ? "✅" : "❌ MISMATCH"}`);

        if (!upMatch || !downMatch) voteCountErrors++;
    }

    if (submissions.length === 0) console.log("  (No submissions found)");

    // ========== 3. User totals vs Vote records ==========
    console.log("\n========================================");
    console.log("  VERIFICATION: User Totals Consistency");
    console.log("========================================\n");

    let userTotalErrors = 0;
    for (const user of users) {
        // Count votes received by this user's submissions
        const userSubmissionIds = submissions
            .filter((s) => s.user.toString() === user._id.toString())
            .map((s) => s._id.toString());

        const receivedUpvotes = votes.filter(
            (v) => userSubmissionIds.includes(v.submission.toString()) && v.voteType === "upvote"
        ).length;
        const receivedDownvotes = votes.filter(
            (v) => userSubmissionIds.includes(v.submission.toString()) && v.voteType === "downvote"
        ).length;

        const upMatch = user.totalUpvotes === receivedUpvotes;
        const downMatch = user.totalDownvotes === receivedDownvotes;

        console.log(`User: ${user.name} (${user._id}):`);
        console.log(`  totalUpvotes:   stored=${user.totalUpvotes}, actual=${receivedUpvotes} ${upMatch ? "✅" : "❌ MISMATCH"}`);
        console.log(`  totalDownvotes: stored=${user.totalDownvotes}, actual=${receivedDownvotes} ${downMatch ? "✅" : "❌ MISMATCH"}`);

        if (!upMatch || !downMatch) userTotalErrors++;
    }

    // ========== 4. Reputation formula check ==========
    console.log("\n========================================");
    console.log("  VERIFICATION: Reputation Formula");
    console.log("========================================\n");
    console.log("  Formula: (totalUpvotes*5) - (totalDownvotes*2) + (tasksCompleted*10) + (consistencyStreak*3)\n");

    let reputationErrors = 0;
    for (const user of users) {
        const expected =
            (user.totalUpvotes * 5) -
            (user.totalDownvotes * 2) +
            (user.tasksCompleted * 10) +
            (user.consistencyStreak * 3);

        const match = user.reputationScore === expected;

        console.log(`User: ${user.name}:`);
        console.log(`  totalUpvotes=${user.totalUpvotes}, totalDownvotes=${user.totalDownvotes}, tasksCompleted=${user.tasksCompleted}, consistencyStreak=${user.consistencyStreak}`);
        console.log(`  reputationScore: stored=${user.reputationScore}, expected=${expected} ${match ? "✅" : "❌ BUG in recalculateReputation()"}`);

        if (!match) reputationErrors++;
    }

    // ========== Summary ==========
    console.log("\n========================================");
    console.log("  SUMMARY");
    console.log("========================================\n");

    const totalErrors = voteCountErrors + userTotalErrors + reputationErrors;
    console.log(`  Vote count mismatches:  ${voteCountErrors}`);
    console.log(`  User total mismatches:  ${userTotalErrors}`);
    console.log(`  Reputation mismatches:  ${reputationErrors}`);
    console.log(`  ──────────────────────────`);
    console.log(`  Total issues:           ${totalErrors}`);
    console.log(totalErrors === 0 ? "\n  ✅ ALL CHECKS PASSED" : "\n  ❌ ISSUES FOUND — SEE ABOVE");

    await mongoose.disconnect();
};

verify().catch(console.error);
