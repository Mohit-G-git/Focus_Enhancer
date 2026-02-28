import mongoose from "mongoose";

const voteSchema = new mongoose.Schema(
    {
        voter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        submission: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Submission",
            required: true,
        },
        voteType: {
            type: String,
            enum: ["upvote", "downvote"],
            required: true,
        },
        reason: {
            type: String,
            required: function () {
                return this.voteType === "downvote";
            },
        },
    },
    { timestamps: true }
);

voteSchema.index({ voter: 1, submission: 1 }, { unique: true });

const Vote = mongoose.model("Vote", voteSchema);

export default Vote;
