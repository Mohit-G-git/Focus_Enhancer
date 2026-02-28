import * as submissionService from "./submission.service.js";

export const submitTask = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { taskId } = req.body;
        const filePath = req.file.path;

        const submission = await submissionService.submitTask(userId, taskId, filePath);

        res.status(201).json({
            success: true,
            message: "Task submitted successfully.",
            data: submission,
        });
    } catch (error) {
        next(error);
    }
};

export const approveSubmission = async (req, res, next) => {
    try {
        const { submissionId } = req.params;

        const submission = await submissionService.approveSubmission(submissionId);

        res.status(200).json({
            success: true,
            message: "Submission approved.",
            data: submission,
        });
    } catch (error) {
        next(error);
    }
};

export const rejectSubmission = async (req, res, next) => {
    try {
        const { submissionId } = req.params;

        const submission = await submissionService.rejectSubmission(submissionId);

        res.status(200).json({
            success: true,
            message: "Submission rejected.",
            data: submission,
        });
    } catch (error) {
        next(error);
    }
};
