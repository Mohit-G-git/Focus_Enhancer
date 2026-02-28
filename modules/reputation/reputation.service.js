import User from "../users/user.model.js";

export const recalculateReputation = async (userId) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new Error("User not found.");
    }

    const reputationScore =
        (user.totalUpvotes * 5) -
        (user.totalDownvotes * 2) +
        (user.tasksCompleted * 10) +
        (user.consistencyStreak * 3);

    user.reputationScore = reputationScore;
    await user.save();

    return user;
};

export const updateReputationOnVote = async (userId, voteType) => {
    if (voteType === "upvote") {
        await User.findByIdAndUpdate(userId, { $inc: { totalUpvotes: 1 } });
    } else if (voteType === "downvote") {
        await User.findByIdAndUpdate(userId, { $inc: { totalDownvotes: 1 } });
    } else if (voteType === "remove_upvote") {
        await User.findByIdAndUpdate(userId, { $inc: { totalUpvotes: -1 } });
    } else if (voteType === "remove_downvote") {
        await User.findByIdAndUpdate(userId, { $inc: { totalDownvotes: -1 } });
    }

    await recalculateReputation(userId);
};

export const updateReputationOnTaskCompletion = async (userId) => {
    await User.findByIdAndUpdate(userId, { $inc: { tasksCompleted: 1 } });

    await recalculateReputation(userId);
};
