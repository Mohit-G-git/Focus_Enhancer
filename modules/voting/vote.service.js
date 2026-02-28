import Vote from "./vote.model.js";
import Submission from "../tasks/submission.model.js";
import { updateReputationOnVote } from "../reputation/reputation.service.js";

export const voteOnSubmission = async (userId, submissionId, voteType, reason) => {
    const submission = await Submission.findById(submissionId);

    if (!submission) {
        throw new Error("Submission not found.");
    }

    if (submission.user.toString() === userId.toString()) {
        const error = new Error("Self-voting is not allowed.");
        error.statusCode = 403;
        throw error;
    }

    const existingVote = await Vote.findOne({ voter: userId, submission: submissionId });

    if (existingVote) {
        throw new Error("You have already voted on this submission.");
    }

    if (voteType === "downvote" && !reason) {
        throw new Error("Reason is required for downvotes.");
    }

    const vote = await Vote.create({
        voter: userId,
        submission: submissionId,
        voteType,
        reason,
    });

    if (voteType === "upvote") {
        await Submission.findByIdAndUpdate(submissionId, { $inc: { upvotes: 1 } });
    } else {
        await Submission.findByIdAndUpdate(submissionId, { $inc: { downvotes: 1 } });
    }

    await updateReputationOnVote(submission.user, voteType);

    return vote;
};

export const removeVote = async (userId, submissionId) => {
    const vote = await Vote.findOneAndDelete({ voter: userId, submission: submissionId });

    if (!vote) {
        throw new Error("Vote not found.");
    }

    if (vote.voteType === "upvote") {
        await Submission.findByIdAndUpdate(submissionId, { $inc: { upvotes: -1 } });
    } else {
        await Submission.findByIdAndUpdate(submissionId, { $inc: { downvotes: -1 } });
    }

    const submission = await Submission.findById(submissionId);
    await updateReputationOnVote(submission.user, vote.voteType === "upvote" ? "remove_upvote" : "remove_downvote");

    return vote;
};
