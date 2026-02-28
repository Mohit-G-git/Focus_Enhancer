import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import * as submissionController from "./submission.controller.js";
import upload from "../../middleware/upload.middleware.js";

const router = Router();

router.post("/:taskId/submit", authenticate, upload.single("pdf"), submissionController.submitTask);
router.patch("/submission/:submissionId/approve", authenticate, authorize("admin", "moderator"), submissionController.approveSubmission);
router.patch("/submission/:submissionId/reject", authenticate, authorize("admin", "moderator"), submissionController.rejectSubmission);

export default router;
