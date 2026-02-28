import Submission from "./submission.model.js";
import { updateReputationOnTaskCompletion } from "../reputation/reputation.service.js";

export const submitTask = async (userId, taskId, filePath) => {
    const existing = await Submission.findOne({ user: userId, task: taskId });

    if (existing) {
        throw new Error("Submission already exists for this user and task.");
    }

    const submission = await Submission.create({
        user: userId,
        task: taskId,
        pdfUrl: filePath,
    });

    return submission;
};

export const approveSubmission = async (submissionId) => {
    const submission = await Submission.findByIdAndUpdate(
        submissionId,
        { status: "approved" },
        { new: true }
    );

    if (!submission) {
        throw new Error("Submission not found.");
    }

    await updateReputationOnTaskCompletion(submission.user);

    return submission;
};

export const rejectSubmission = async (submissionId) => {
    const submission = await Submission.findByIdAndUpdate(
        submissionId,
        { status: "rejected" },
        { new: true }
    );

    if (!submission) {
        throw new Error("Submission not found.");
    }

    return submission;
};
