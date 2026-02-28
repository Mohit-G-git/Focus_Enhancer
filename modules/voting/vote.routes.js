import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import * as voteController from "./vote.controller.js";

const router = Router();

router.post("/:submissionId", authenticate, voteController.voteOnSubmission);
router.delete("/:submissionId", authenticate, voteController.removeVote);

export default router;
