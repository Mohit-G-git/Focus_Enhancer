import * as voteService from "./vote.service.js";

export const voteOnSubmission = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { submissionId } = req.params;
        const { voteType, reason } = req.body;

        const vote = await voteService.voteOnSubmission(userId, submissionId, voteType, reason);

        res.status(201).json({
            success: true,
            message: "Vote recorded successfully.",
            data: vote,
        });
    } catch (error) {
        next(error);
    }
};

export const removeVote = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { submissionId } = req.params;

        const vote = await voteService.removeVote(userId, submissionId);

        res.status(200).json({
            success: true,
            message: "Vote removed successfully.",
            data: vote,
        });
    } catch (error) {
        next(error);
    }
};
