import { generateContent, parseJSON } from './geminiClient.js';

/* ================================================================
   AI ARBITRATION SERVICE — Peer Review Dispute Resolution
   ================================================================
   When a downvoted student DISAGREES with the downvote, the AI is
   asked to determine whether the downvoter's remark is valid.

   The AI receives:
     1. The theory questions from the quiz attempt
     2. A summary of the student's submitted PDF (or the path)
     3. The downvoter's specific remark / reason
     4. The task context (topic, course, difficulty)

   It returns a structured verdict:
     { decision, reasoning, confidence }
   ================================================================ */

/**
 * Arbitrate a peer review dispute.
 *
 * @param {Object} params
 * @param {string[]} params.theoryQuestions — the 7 theory questions
 * @param {string}   params.pdfPath — path to the student's PDF submission
 * @param {string}   params.downvoteReason — the downvoter's stated reason
 * @param {string}   params.taskTitle — task title for context
 * @param {string}   params.taskTopic — task topic
 * @param {string}   params.courseName — course name
 * @returns {Promise<{decision: 'downvoter_correct'|'reviewee_correct', reasoning: string, confidence: number}>}
 */
export async function arbitrateDispute({
    theoryQuestions,
    pdfPath,
    downvoteReason,
    taskTitle,
    taskTopic,
    courseName,
}) {
    const questionsBlock = theoryQuestions
        .map((q, i) => `Q${i + 1}: ${q}`)
        .join('\n');

    const prompt = `You are an impartial academic judge resolving a peer review dispute.

CONTEXT:
- Course: ${courseName}
- Topic: ${taskTopic}
- Task: ${taskTitle}

THEORY QUESTIONS THAT WERE ASKED:
${questionsBlock}

STUDENT'S HANDWRITTEN SOLUTIONS:
The student submitted their solutions as a PDF located at: ${pdfPath}
(Assume the solutions cover the above questions as written work.)

DOWNVOTER'S COMPLAINT:
"${downvoteReason}"

YOUR TASK:
1. Analyze whether the downvoter's complaint is legitimate and well-founded.
2. Consider whether the complaint points to genuine errors, insufficient answers, or incorrect solutions.
3. Consider whether the complaint is trivial, unfounded, or malicious.

RULES:
- Be fair. A student should not lose tokens for minor formatting issues.
- The complaint must identify a SUBSTANTIVE error in the solutions.
- Vague complaints like "bad answers" without specifics should favor the student.
- Specific, accurate critiques of wrong methods/answers favor the downvoter.

Output ONLY a JSON object:
{
  "decision": "downvoter_correct" or "reviewee_correct",
  "reasoning": "2-3 sentence explanation of your judgment",
  "confidence": 0.0 to 1.0
}`;

    const raw = await generateContent(prompt, 'Arbitration');
    const verdict = parseJSON(raw);

    // Validate structure
    if (!['downvoter_correct', 'reviewee_correct'].includes(verdict.decision)) {
        throw new Error(`Invalid AI decision: ${verdict.decision}`);
    }
    if (typeof verdict.confidence !== 'number' || verdict.confidence < 0 || verdict.confidence > 1) {
        verdict.confidence = 0.5;
    }

    return verdict;
}
