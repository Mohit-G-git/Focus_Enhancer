import { Router } from "express";
import mongoose from "mongoose";
import Submission from "../tasks/submission.model.js";
import Vote from "../voting/vote.model.js";
import User from "../users/user.model.js";
import Task from "../tasks/task.model.js";
import * as submissionService from "../tasks/submission.service.js";
import * as voteService from "../voting/vote.service.js";
import { recalculateReputation } from "../reputation/reputation.service.js";
import upload from "../../middleware/upload.middleware.js";

const router = Router();

// ============================================================
// GET /member3-test — Full automated validation flow
// ============================================================
router.get("/", async (req, res) => {
    const results = {
        timestamp: new Date().toISOString(),
        module: "Member 3 — Submission + Voting + Reputation",
        steps: [],
        dbVerification: null,
        indexValidation: null,
        overallStatus: "PENDING",
    };

    let testUser = null;
    let testVoter = null;
    let testTask = null;
    let testSubmission = null;
    let testVote = null;

    try {
        // ── Step 1: Create test user (submission author) ──
        testUser = await User.create({
            name: "Test_Member3_Author",
            email: `test_author_${Date.now()}@m3test.com`,
            password: "test_hashed_password",
            role: "student",
        });
        results.steps.push({ step: "1. Create test author", status: "✅ PASS", userId: testUser._id });

        // ── Step 2: Create test voter ──
        testVoter = await User.create({
            name: "Test_Member3_Voter",
            email: `test_voter_${Date.now()}@m3test.com`,
            password: "test_hashed_password",
            role: "student",
        });
        results.steps.push({ step: "2. Create test voter", status: "✅ PASS", voterId: testVoter._id });

        // ── Step 3: Create test task ──
        testTask = await Task.create({
            title: "M3 Test Task",
            description: "Temporary task for Member 3 validation",
        });
        results.steps.push({ step: "3. Create test task", status: "✅ PASS", taskId: testTask._id });

        // ── Step 4: Submit task (mock file path) ──
        testSubmission = await submissionService.submitTask(
            testUser._id,
            testTask._id,
            "uploads/submissions/test-mock-file.pdf"
        );
        const submitPass = testSubmission && testSubmission.status === "pending";
        results.steps.push({
            step: "4. Submit task",
            status: submitPass ? "✅ PASS" : "❌ FAIL",
            submissionId: testSubmission._id,
            submissionStatus: testSubmission.status,
        });

        // ── Step 5: Vote on submission (upvote) ──
        testVote = await voteService.voteOnSubmission(
            testVoter._id,
            testSubmission._id,
            "upvote",
            null
        );
        const updatedSubAfterVote = await Submission.findById(testSubmission._id);
        const votePass = testVote && updatedSubAfterVote.upvotes === 1;
        results.steps.push({
            step: "5. Vote (upvote)",
            status: votePass ? "✅ PASS" : "❌ FAIL",
            voteId: testVote._id,
            submissionUpvotes: updatedSubAfterVote.upvotes,
        });

        // ── Step 5b: Verify user reputation after vote ──
        const userAfterVote = await User.findById(testUser._id);
        results.steps.push({
            step: "5b. Reputation after vote",
            status: userAfterVote.totalUpvotes === 1 ? "✅ PASS" : "❌ FAIL",
            totalUpvotes: userAfterVote.totalUpvotes,
            reputationScore: userAfterVote.reputationScore,
        });

        // ── Step 6: Remove vote ──
        await voteService.removeVote(testVoter._id, testSubmission._id);
        const updatedSubAfterRemove = await Submission.findById(testSubmission._id);
        const userAfterRemove = await User.findById(testUser._id);
        const removePass = updatedSubAfterRemove.upvotes === 0 && userAfterRemove.totalUpvotes === 0;
        results.steps.push({
            step: "6. Remove vote",
            status: removePass ? "✅ PASS" : "❌ FAIL",
            submissionUpvotes: updatedSubAfterRemove.upvotes,
            totalUpvotes: userAfterRemove.totalUpvotes,
            reputationScore: userAfterRemove.reputationScore,
        });

        // ── Step 7: Re-vote (for approve test) ──
        await voteService.voteOnSubmission(testVoter._id, testSubmission._id, "upvote", null);
        results.steps.push({ step: "7. Re-vote for approve test", status: "✅ PASS" });

        // ── Step 8: Approve submission ──
        const approvedSub = await submissionService.approveSubmission(testSubmission._id);
        const userAfterApprove = await User.findById(testUser._id);
        const approvePass = approvedSub.status === "approved" && userAfterApprove.tasksCompleted === 1;
        results.steps.push({
            step: "8. Approve submission",
            status: approvePass ? "✅ PASS" : "❌ FAIL",
            submissionStatus: approvedSub.status,
            tasksCompleted: userAfterApprove.tasksCompleted,
        });

        // ── Step 9: Self-vote prevention ──
        let selfVoteBlocked = false;
        try {
            await voteService.voteOnSubmission(testUser._id, testSubmission._id, "upvote", null);
        } catch (e) {
            selfVoteBlocked = e.statusCode === 403;
        }
        results.steps.push({
            step: "9. Self-vote prevention",
            status: selfVoteBlocked ? "✅ PASS (blocked)" : "❌ FAIL (allowed)",
        });

        // ── Step 10: Duplicate submission prevention ──
        let dupBlocked = false;
        try {
            await submissionService.submitTask(testUser._id, testTask._id, "uploads/submissions/dup.pdf");
        } catch (e) {
            dupBlocked = true;
        }
        results.steps.push({
            step: "10. Duplicate submission prevention",
            status: dupBlocked ? "✅ PASS (blocked)" : "❌ FAIL (allowed)",
        });

        // ── Final: Database Verification ──
        const finalUser = await User.findById(testUser._id);
        const finalSub = await Submission.findById(testSubmission._id);
        const voteCount = await Vote.countDocuments({ submission: testSubmission._id });

        const expectedReputation =
            (finalUser.totalUpvotes * 5) -
            (finalUser.totalDownvotes * 2) +
            (finalUser.tasksCompleted * 10) +
            (finalUser.consistencyStreak * 3);

        const formulaMatch = finalUser.reputationScore === expectedReputation;

        results.dbVerification = {
            submissionStatus: finalSub.status,
            voteCount,
            submissionUpvotes: finalSub.upvotes,
            submissionDownvotes: finalSub.downvotes,
            totalUpvotes: finalUser.totalUpvotes,
            totalDownvotes: finalUser.totalDownvotes,
            tasksCompleted: finalUser.tasksCompleted,
            consistencyStreak: finalUser.consistencyStreak,
            reputationScore: finalUser.reputationScore,
            expectedReputation,
            formulaMatch: formulaMatch ? "✅ MATCH" : "❌ MISMATCH",
        };

        const allPassed = results.steps.every((s) => s.status.includes("✅"));
        results.overallStatus = allPassed && formulaMatch ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED";

    } catch (error) {
        results.steps.push({ step: "RUNTIME ERROR", status: "❌ FAIL", error: error.message });
        results.overallStatus = "❌ RUNTIME ERROR";
    } finally {
        // ── Cleanup test data ──
        try {
            if (testSubmission) await Vote.deleteMany({ submission: testSubmission._id });
            if (testSubmission) await Submission.findByIdAndDelete(testSubmission._id);
            if (testTask) await Task.findByIdAndDelete(testTask._id);
            if (testUser) await User.findByIdAndDelete(testUser._id);
            if (testVoter) await User.findByIdAndDelete(testVoter._id);
            results.cleanup = "✅ Test data cleaned up";
        } catch (e) {
            results.cleanup = `⚠️ Cleanup error: ${e.message}`;
        }
    }

    res.json(results);
});

// ============================================================
// GET /member3-test/indexes — Validate MongoDB indexes
// ============================================================
router.get("/indexes", async (req, res) => {
    try {
        const submissionIndexes = await Submission.collection.indexes();
        const voteIndexes = await Vote.collection.indexes();

        const submissionHasCompound = submissionIndexes.some(
            (idx) => idx.key && idx.key.user === 1 && idx.key.task === 1 && idx.unique
        );
        const voteHasCompound = voteIndexes.some(
            (idx) => idx.key && idx.key.voter === 1 && idx.key.submission === 1 && idx.unique
        );

        res.json({
            submissionIndexes: {
                all: submissionIndexes.map((i) => ({ name: i.name, key: i.key, unique: i.unique || false })),
                compoundUniqueIndex: submissionHasCompound ? "✅ EXISTS" : "❌ MISSING",
            },
            voteIndexes: {
                all: voteIndexes.map((i) => ({ name: i.name, key: i.key, unique: i.unique || false })),
                compoundUniqueIndex: voteHasCompound ? "✅ EXISTS" : "❌ MISSING",
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// POST /member3-test/multer — Test multer PDF upload
// ============================================================
router.post("/multer", upload.single("pdf"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded." });
    }
    res.json({
        success: true,
        message: "✅ PDF uploaded successfully",
        file: {
            originalName: req.file.originalname,
            storedPath: req.file.path,
            size: `${(req.file.size / 1024).toFixed(1)} KB`,
            mimetype: req.file.mimetype,
        },
        validation: {
            isPDF: req.file.mimetype === "application/pdf" ? "✅" : "❌",
            under5MB: req.file.size <= 5 * 1024 * 1024 ? "✅" : "❌",
            storedInCorrectDir: req.file.path.includes("uploads") ? "✅" : "❌",
        },
    });
});

// Multer error handler for this route
router.use((err, req, res, next) => {
    if (err.message === "Only PDF files are allowed.") {
        return res.status(400).json({
            success: false,
            message: "❌ MULTER VALIDATION WORKING — Non-PDF rejected",
            error: err.message,
        });
    }
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
            success: false,
            message: "❌ MULTER VALIDATION WORKING — File exceeds 5MB limit",
            error: "File too large. Maximum 5MB allowed.",
        });
    }
    next(err);
});

export default router;
