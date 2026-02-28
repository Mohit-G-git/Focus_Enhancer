# Focus Enhancer — Backend API v4.2

> AI-powered academic task platform with token economics, gamified quizzes, peer review arbitration, reputation scoring, course proficiency, leaderboards, task supersession, **tolerance (absence protection)**, and a personal AI chatbot.

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
  - [Auth](#auth)
  - [Courses](#courses)
  - [Announcements (CR-only)](#announcements-cr-only)
  - [Tasks](#tasks)
  - [Quiz](#quiz)
  - [Theory Submissions](#theory-submissions)
  - [Peer Review](#peer-review)
  - [Leaderboards](#leaderboards)
  - [Chat (Focus Buddy)](#chat-focus-buddy)
- [Data Schemas](#data-schemas)
- [Peer Review System](#peer-review-system)
- [Reputation Score](#reputation-score)
- [Course Proficiency](#course-proficiency)
- [CR Flow — Class Representative](#cr-flow--class-representative)
- [Token Economics](#token-economics)
- [Token Decay](#token-decay)
- [Tolerance (Absence Protection)](#tolerance-absence-protection)
- [Path A — CR-Driven Day-by-Day Scheduling](#path-a--cr-driven-day-by-day-scheduling)
- [Path B — Auto-Pilot Weekly Chapters + Sunday Revision](#path-b--auto-pilot-weekly-chapters--sunday-revision)
- [Quiz Flow](#quiz-flow)
- [Focus Buddy (Chatbot)](#focus-buddy-chatbot)
- [Cron Jobs](#cron-jobs)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Security](#security)
- [Testing](#testing)

---

## Architecture

```
Path A (CR active — Day-by-Day Study Plan):
  CR posts announcement (event in N days, topics: [A, B, C])
    → System pre-generates ALL tasks upfront, 1-2 per day:
      Pass 1 (40% of days): LEARN — fresh study, easy→medium
      Pass 2 (35% of days): REVISE 1 — application, medium→hard
      Pass 3 (25% of days): REVISE 2 — exam-ready, hard, mixed
    → Each topic cycles within each pass (round-robin)
    → Student stakes X tokens → 6 MCQs (15s each)
    → Score ≥ 8 → WIN X tokens | Score < 8 → LOSE X tokens
    → If passed → 7 theory questions → submit handwritten PDF
    → NEW tasks supersede OLD tasks on overlapping dates
    → Tasks with active QuizAttempts are protected from supersession

Path B (No CR activity — Auto-Pilot):
  MONDAY (Weekly Cron):
    Course with no CR announcements in 30 days?
      → Parse next chapter from textbook
      → Generate 6 tasks (Mon–Sat): easy→medium→hard
      → Chapter fully covered by Saturday

  SUNDAY (Weekly Cron):
    For each student → pick ONE course (rotating)
      → Select chapters for revision (spaced repetition)
      → Generate retention-focused tasks

Focus Buddy (AI Chatbot):
  Student sends message → System loads live context
    (courses, progress, quiz scores, tokens, today's tasks)
    → Gemini generates personalized response
    → Detects mood → saves to user wellbeing history
    → Handles: doubt solving, emotional support, study coaching

Peer Review System:
  Student submits theory PDF → Showcased on profile
    → Other students view questions + PDF solution
    → UPVOTE: costs wager tokens, no score impact
    → DOWNVOTE: costs wager, requires reason
       → Reviewee can AGREE (loses task tokens, downvoter rewarded)
       → Reviewee can DISAGREE → AI Arbitration via Gemini:
          AI correct? → Downvoted loses task tokens, downvoter gains wager
          AI wrong?   → Downvoter loses wager, reviewee keeps tokens

Reputation & Leaderboards:
  reputationScore = f(upvotes, downvotesLost, downvotesDefended,
                      quizzesPassed, tokensLost, tasksCompleted)
  courseProficiency = f(upvotes, downvotes, wins, losses per course)
  Overall leaderboard: tokenBalance + reputation
  Course leaderboard:  proficiencyScore + reputation

CR — Class Representative (2 functions only):
  1. Upload the course textbook PDF
  2. Create announcements for upcoming events
```

## Quick Start

```bash
# 1. Clone & install
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your keys (see below)

# 3. Start server
npm run dev     # development (with hot reload)
npm start       # production
```

The `uploads/` directory is created automatically on startup.

## Environment Variables

| Variable | Required | Description | Default |
|---|---|---|---|
| `PORT` | No | Server port | `5000` |
| `MONGO_URI` | **Yes** | MongoDB connection string | — |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key | — |
| `JWT_SECRET` | **Yes** | JWT signing secret (min 32 chars) | — |
| `NODE_ENV` | No | `development` or `production` | `development` |
| `GEMINI_MODEL` | No | Primary Gemini model | `gemini-2.0-flash-lite` |

---

## API Reference

**Base URL:** `http://localhost:5000/api`

All responses follow: `{ "success": true|false, "message": "...", "data": {...} }`

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Server health check (API v4.0) |

---

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Register a new user |
| `POST` | `/api/auth/login` | — | Login, receive JWT |
| `GET` | `/api/auth/me` | Bearer | Get current user profile (populated courses) |
| `PUT` | `/api/auth/profile` | Bearer | Update profile metadata |

#### Register
```json
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@uni.edu",
  "password": "secure123",
  "role": "student",
  "studentId": "CS2023001",
  "department": "Computer Science",
  "semester": 4,
  "year": 2025,
  "university": "MIT"
}
```

#### Update Profile
```json
PUT /api/auth/profile
Headers: Authorization: Bearer <token>
{
  "name": "John D.",
  "department": "Computer Science & Engineering",
  "semester": 5,
  "avatar": "https://..."
}
```

Allowed fields: `name`, `studentId`, `department`, `semester`, `year`, `university`, `avatar`

---

### Courses

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/courses` | Bearer | Create a new course |
| `GET` | `/api/courses` | — | List all courses (with filters) |
| `GET` | `/api/courses/:courseId` | Bearer | Get course details (CR sees students) |
| `PUT` | `/api/courses/:courseId/claim-cr` | Bearer | Claim CR role for a course |
| `POST` | `/api/courses/:courseId/upload-book` | Bearer (CR) | Upload textbook PDF |
| `POST` | `/api/courses/:courseId/enroll` | Bearer | Self-enroll in a course |
| `GET` | `/api/courses/:courseId/students` | Bearer (CR) | List enrolled students |

#### Create Course
```json
POST /api/courses
Headers: Authorization: Bearer <token>
{
  "courseCode": "CS301",
  "title": "Data Structures & Algorithms",
  "department": "Computer Science",
  "semester": 3,
  "year": 2025,
  "durationType": "full",
  "creditWeight": 4
}
```

#### Upload Book (CR-only)
```bash
curl -X POST http://localhost:5000/api/courses/COURSE_ID/upload-book \
  -H "Authorization: Bearer CR_TOKEN" \
  -F "book=@textbook.pdf" \
  -F "bookTitle=Data Structures Textbook"
```

The system auto-extracts chapters from the PDF for fallback task generation.

#### List Courses (with filters)
```
GET /api/courses?department=Computer+Science&semester=3&year=2025
```

---

### Announcements (CR-only)

CRs have exactly **2 functions**: upload textbook + create announcements.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/announcements` | Bearer (CR) | Create event → auto-generates day-by-day tasks |
| `GET` | `/api/announcements/course/:courseId` | — | Get course announcements |

#### Create Announcement
```json
POST /api/announcements
Headers: Authorization: Bearer <CR_TOKEN>
{
  "courseId": "COURSE_ID",
  "eventType": "midterm",
  "title": "Midterm Exam - Trees & Graphs",
  "topics": ["Binary Trees", "Graph Traversal", "Hashing"],
  "eventDate": "2026-03-15",
  "description": "Covers chapters 5-8"
}
```

**Validations:**
- User must have role `cr`
- User must be the CR for this specific course (`course.courseRep === user.id`)
- `eventDate` must be in the future

**What happens:** The system generates a complete day-by-day study plan across 3 passes.

**Event Types:** `quiz` | `assignment` | `midterm` | `final` | `lecture` | `lab`

---

### Tasks

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tasks/course/:courseId` | — | All tasks (with filters) |
| `GET` | `/api/tasks/today/:courseId` | — | Today's scheduled tasks |
| `GET` | `/api/tasks/schedule/:courseId` | — | Full day-by-day schedule (grouped) |
| `GET` | `/api/tasks/:taskId` | — | Single task detail |

**Query filters:**
```
GET /api/tasks/course/:courseId?difficulty=easy&type=reading&date=2026-03-05&pass=1&revision=true
```

---

### Quiz

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/quiz/:taskId/start` | — | Stake tokens + receive 6 MCQs |
| `POST` | `/api/quiz/:taskId/answer` | — | Answer one MCQ (15s per question) |
| `GET` | `/api/quiz/:taskId/mcq-result` | — | Get score + token settlement |
| `GET` | `/api/quiz/:taskId/theory` | — | Get 7 theory questions (MCQ pass required) |
| `POST` | `/api/quiz/:taskId/submit-theory` | — | Upload handwritten PDF (legacy) |

---

### Theory Submissions

Dedicated endpoints for managing theory answer uploads.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/theory/:taskId/submit` | Bearer | Upload theory PDF (MCQ pass required) |
| `GET` | `/api/theory/:taskId/submission` | Bearer | Get submission for a task |
| `GET` | `/api/theory/my-submissions` | Bearer | List all my submissions |

#### Submit Theory
```bash
curl -X POST http://localhost:5000/api/theory/TASK_ID/submit \
  -H "Authorization: Bearer TOKEN" \
  -F "solutions=@my_solutions.pdf"
```

Response includes `gradingStatus` (currently `pending` — AI grading pipeline ready for integration).

---

### Peer Review

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/reviews/accomplished/:userId` | — | List user's accomplished tasks (profile showcase) |
| `GET` | `/api/reviews/solution/:taskId/:userId` | Bearer | View theory questions + PDF for a submission |
| `POST` | `/api/reviews/upvote` | Bearer | Upvote a solution (costs wager tokens) |
| `POST` | `/api/reviews/downvote` | Bearer | Downvote a solution (costs wager + requires reason) |
| `POST` | `/api/reviews/:reviewId/respond` | Bearer | Reviewee responds: agree or disagree (triggers AI) |
| `GET` | `/api/reviews/my-reviews` | Bearer | List reviews you've given |
| `GET` | `/api/reviews/received` | Bearer | List reviews on your submissions |

#### Upvote
```json
POST /api/reviews/upvote
Headers: Authorization: Bearer <token>
{
  "taskId": "TASK_ID",
  "revieweeId": "USER_ID",
  "wager": 5
}
```

#### Downvote
```json
POST /api/reviews/downvote
Headers: Authorization: Bearer <token>
{
  "taskId": "TASK_ID",
  "revieweeId": "USER_ID",
  "wager": 10,
  "reason": "The derivation in Q3 uses the wrong recurrence relation for merge sort."
}
```

#### Respond to Downvote
```json
POST /api/reviews/:reviewId/respond
Headers: Authorization: Bearer <token>
{
  "action": "agree"    // or "disagree" → triggers AI arbitration
}
```

**Dispute Flow:**
- `agree` → Reviewee loses task's `tokenStake`, downvoter gets wager back + wager as reward
- `disagree` → AI (Gemini) analyzes questions, PDF, and downvote reason
  - AI says downvoter correct → same as agree
  - AI says reviewee correct → downvoter loses wager permanently, reviewee's `downvotesDefended` incremented

---

### Leaderboards

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/leaderboard/overall` | — | Overall ranking: tokens + reputation |
| `GET` | `/api/leaderboard/course/:courseId` | — | Course ranking: proficiency + reputation |

Both endpoints support `?page=1&limit=20` pagination.

#### Overall Leaderboard Response
```json
{
  "success": true,
  "count": 20,
  "total": 150,
  "page": 1,
  "data": [
    {
      "rank": 1,
      "userId": "...",
      "name": "Alice",
      "tokenBalance": 350,
      "reputation": 85,
      "stats": { "tasksCompleted": 12, "quizzesPassed": 10, "upvotesReceived": 8, "downvotesLost": 1 }
    }
  ]
}
```

#### Course Leaderboard Response
```json
{
  "success": true,
  "course": { "_id": "...", "title": "Data Structures", "courseCode": "CS301" },
  "data": [
    {
      "rank": 1,
      "name": "Alice",
      "proficiencyScore": 135,
      "reputation": 85,
      "metrics": { "upvotesReceived": 10, "downvotesLost": 0, "downvotesDefended": 2, "tasksCompleted": 5, "quizzesPassed": 4 }
    }
  ]
}
```

---

### Chat (Focus Buddy)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat/message` | — | Send a message, get AI response |
| `GET` | `/api/chat/conversations` | — | List all conversations |
| `GET` | `/api/chat/conversations/:id` | — | Full conversation history |
| `DELETE` | `/api/chat/conversations/:id` | — | Delete a conversation |

```json
POST /api/chat/message
{
  "userId": "USER_ID",
  "message": "I don't understand binary search trees",
  "conversationId": "CONV_ID (optional)"
}
```

---

## Data Schemas

### User

| Field | Type | Description |
|---|---|---|
| `name` | String | Required |
| `email` | String | Unique, lowercase |
| `passwordHash` | String | select: false (bcrypt, 12 rounds) |
| `studentId` | String | Unique sparse (e.g., "CS2023001") |
| `department` | String | e.g., "Computer Science" |
| `semester` | Number | 1-8 |
| `year` | Number | Academic year |
| `university` | String | Institution name |
| `avatar` | String | URL |
| `tokenBalance` | Number | Default: 100 |
| `reputation` | Number | Default: 0 |
| `role` | Enum | `student` / `cr` / `admin` |
| `enrolledCourses` | [ObjectId → Course] | |
| `streak.currentDays` | Number | Current active streak |
| `streak.longestStreak` | Number | All-time longest |
| `streak.lastActiveDate` | Date | |
| `stats.tasksCompleted` | Number | Running total |
| `stats.quizzesTaken` | Number | Running total |
| `stats.quizzesPassed` | Number | Running total |
| `stats.avgMcqScore` | Number | Running average |
| `stats.tokensEarned` | Number | Lifetime earned |
| `stats.tokensLost` | Number | Lifetime lost |
| `stats.upvotesReceived` | Number | Peer review upvotes received |
| `stats.downvotesReceived` | Number | Total downvotes received |
| `stats.downvotesLost` | Number | Downvotes where AI/agree ruled against you |
| `stats.downvotesDefended` | Number | Downvotes successfully defended |
| `stats.reviewsGiven` | Number | Total reviews given to others |
| `wellbeing.moodHistory` | [{mood, recordedAt}] | Last 30 entries (FIFO) |
| `wellbeing.lastChatAt` | Date | Last chatbot interaction |

**Helper Methods:**
- `comparePassword(candidate)` — bcrypt comparison
- `addMoodEntry(mood)` — append to moodHistory, cap at 30
- `recordMcqScore(score)` — update running MCQ average
- `recalculateReputation()` — recompute reputation from stats
- `updateStreak()` — bump/reset streak based on last active date

### Course

| Field | Type | Description |
|---|---|---|
| `courseCode` | String | Required, unique, uppercase (e.g., "CS301") |
| `title` | String | Required |
| `department` | String | |
| `semester` / `year` | Number | |
| `durationType` | Enum | `full` (16 weeks) / `fractal` (8 weeks) |
| `creditWeight` | Number | 1-6, default: 3 |
| `bookPdfPath` | String | Absolute path to uploaded PDF |
| `bookTitle` | String | |
| `book.originalName` | String | Original filename |
| `book.storedPath` | String | Server path |
| `book.sizeBytes` | Number | File size |
| `book.uploadedAt` | Date | |
| `book.uploadedBy` | ObjectId → User | CR who uploaded |
| `courseRep` | ObjectId → User | Assigned CR |
| `enrolledStudents` | [ObjectId → User] | |
| `chapters` | [{number, title}] | Auto-extracted from PDF |
| `currentChapterIndex` | Number | Fallback task progress |
| `lastAnnouncementDate` | Date | Tracks CR activity |
| `chapterCount` | Virtual | `chapters.length` |

### Task

| Field | Type | Description |
|---|---|---|
| `title` | String | |
| `description` | String | |
| `topic` | String | |
| `type` | Enum | `coding` / `reading` / `writing` / `quiz` / `project` |
| `difficulty` | Enum | `easy` / `medium` / `hard` |
| `tokenStake` | Number | Tokens deducted on quiz start |
| `reward` | Number | Tokens earned on pass (= stake) |
| `urgencyMultiplier` | Number | 1.0–2.0 |
| `durationHours` | Number | Max 4 |
| `deadline` | Date | |
| `scheduledDate` | Date | Which day to do this task |
| `passNumber` | Enum | 1 (learn) / 2 (revise 1) / 3 (revise 2) |
| `isRevision` | Boolean | |
| `chapterRef` | {number, title} | |
| `source` | Enum | `announcement` / `fallback` / `sunday_revision` |
| `status` | Enum | `pending` / `in_progress` / `completed` / `expired` |
| `completedAt` | Date | |
| `course` | ObjectId → Course | |
| `announcement` | ObjectId → Announcement | |
| `generationContext` | Object | {courseName, creditWeight, eventType, urgency} |

### TheorySubmission

| Field | Type | Description |
|---|---|---|
| `student` | ObjectId → User | |
| `task` | ObjectId → Task | |
| `quizAttempt` | ObjectId → QuizAttempt | |
| `course` | ObjectId → Course | |
| `pdf.originalName` | String | |
| `pdf.storedPath` | String | |
| `pdf.sizeBytes` | Number | |
| `pdf.uploadedAt` | Date | |
| `aiGrading.status` | Enum | `pending` / `grading` / `graded` / `failed` |
| `aiGrading.totalScore` | Number | Out of 70 (7 × 10) |
| `aiGrading.feedback` | String | Overall AI feedback |
| `aiGrading.questionBreakdown` | [{questionIndex, score, maxScore, feedback}] | Per-question |
| `tokensAwarded` | Number | |

Unique constraint: one submission per student per task.

### QuizAttempt

| Field | Type | Description |
|---|---|---|
| `user` | ObjectId → User | |
| `task` | ObjectId → Task | |
| `course` | ObjectId → Course | |
| `mcqs` | [6 MCQ objects] | Generated questions |
| `mcqResponses` | [{questionIndex, selectedAnswer, isCorrect, points, timeTakenMs}] | |
| `mcqScore` | Number | -12 to +12 |
| `mcqPassed` | Boolean | Score ≥ 8 |
| `theoryQuestions` | [7 strings] | Generated after MCQ pass |
| `theorySubmission` | ObjectId → TheorySubmission | |
| `status` | Enum | `mcq_in_progress` / `mcq_completed` / `theory_pending` / `submitted` / `failed` |
| `tokenSettled` | Boolean | Whether tokens have been awarded/forfeited |

### Announcement

| Field | Type | Description |
|---|---|---|
| `course` | ObjectId → Course | |
| `eventType` | Enum | `quiz`/`assignment`/`midterm`/`final`/`lecture`/`lab` |
| `title` | String | |
| `topics` | [String] | At least 1 |
| `eventDate` | Date | Must be in the future |
| `createdBy` | ObjectId → User | The CR (hidden in GET responses) |
| `tasksGenerated` | Boolean | Whether AI task generation succeeded |
| `isActive` | Boolean | Soft-delete support |

### PeerReview

| Field | Type | Description |
|---|---|---|
| `reviewer` | ObjectId → User | Who is reviewing |
| `reviewee` | ObjectId → User | Whose solution is reviewed |
| `task` | ObjectId → Task | The task being reviewed |
| `quizAttempt` | ObjectId → QuizAttempt | |
| `theorySubmission` | ObjectId → TheorySubmission | |
| `course` | ObjectId → Course | |
| `type` | Enum | `upvote` / `downvote` |
| `wager` | Number | Compulsory token bet (min 1) |
| `reason` | String | Required for downvotes (min 10 chars) |
| `disputeStatus` | Enum | `none` / `pending_response` / `agreed` / `disputed` / `ai_reviewing` / `resolved_downvoter_wins` / `resolved_reviewee_wins` |
| `aiVerdict.decision` | Enum | `downvoter_correct` / `reviewee_correct` |
| `aiVerdict.reasoning` | String | AI explanation |
| `aiVerdict.confidence` | Number | 0.0–1.0 |
| `settled` | Boolean | Whether tokens have been transferred |
| `tokensTransferred` | Number | Amount moved |

Unique constraint: one review per reviewer per task.

### CourseProficiency

| Field | Type | Description |
|---|---|---|
| `user` | ObjectId → User | |
| `course` | ObjectId → Course | |
| `upvotesReceived` | Number | Upvotes on this course's tasks |
| `downvotesReceived` | Number | |
| `downvotesLost` | Number | AI/agreed ruled against |
| `downvotesDefended` | Number | AI ruled in favor |
| `tasksCompleted` | Number | |
| `tasksAttempted` | Number | |
| `quizzesPassed` | Number | |
| `quizzesFailed` | Number | |
| `proficiencyScore` | Number | Computed from above metrics |

Unique constraint: one document per user per course.

### TokenLedger

| Field | Type | Description |
|---|---|---|
| `userId` | ObjectId → User | |
| `taskId` | ObjectId → Task | |
| `type` | Enum | `stake` / `reward` / `penalty` / `bonus` / `initial` / `peer_wager` / `peer_reward` / `peer_penalty` |
| `amount` | Number | Signed (+/-) |
| `balanceAfter` | Number | Balance after transaction |
| `note` | String | Human-readable description |

---

## Peer Review System

```
Student completes quiz + submits theory PDF
  → Submission appears on their profile ("Accomplished Tasks")
  → Other students can view: questions asked + handwritten PDF

Reviewer clicks on an accomplished task:
  1. Sees the 7 theory questions + PDF solution
  2. Can UPVOTE or DOWNVOTE

UPVOTE:
  → Costs `wager` tokens (deducted from reviewer)
  → No score changes for either party
  → Reviewee's `upvotesReceived` incremented
  → Reputation & course proficiency recalculated

DOWNVOTE:
  → Costs `wager` tokens + requires a written reason (≥10 chars)
  → Reviewee notified (disputeStatus: "pending_response")
  → Reviewee has two options:

    AGREE:
      → Reviewee loses task's tokenStake
      → Downvoter gets wager back + wager amount as bonus
      → Reviewee's downvotesLost incremented

    DISAGREE → AI ARBITRATION:
      → Gemini analyzes: theory questions + PDF + downvote reason
      → If AI says downvoter is correct:
         → Same outcome as AGREE
      → If AI says reviewee is correct:
         → Downvoter loses wager permanently
         → Reviewee's downvotesDefended incremented
         → Reviewee keeps all tokens
```

---

## Reputation Score

A global metric computed from a user's aggregate peer review and academic performance.

**Formula:**
```
reputation = max(0,
    upvotesReceived × 10
  − downvotesLost × 15
  + downvotesDefended × 5
  + quizzesPassed × 3
  − tokensLost / 10
  + tasksCompleted × 2
)
```

Reputation is recalculated automatically on every peer review event. It's displayed on leaderboards alongside token balance.

---

## Course Proficiency

Per-user per-course skill metric, showing how well a student has mastered a specific course.

**Formula:**
```
proficiencyScore = max(0,
    upvotesReceived × 10
  − downvotesLost × 15
  + downvotesDefended × 5
  + tasksCompleted × 3
  − quizzesFailed × 2
  + quizzesPassed × 5
)
```

Automatically updated on quiz completion and peer review events. Powers the course-specific leaderboard.

---

## CR Flow — Class Representative

A CR has exactly **2 responsibilities**:

### 1. Upload Textbook
```
POST /api/courses/:courseId/upload-book
  → Saves PDF to uploads/
  → Auto-extracts chapters via Gemini
  → Stores book metadata (name, size, upload date)
  → Enables Path B fallback task generation
```

### 2. Create Announcements
```
POST /api/announcements
  → Validates: user is CR, is CR for THIS course, eventDate in future
  → Creates announcement record
  → Auto-generates day-by-day tasks via AI (Path A)
  → Updates course.lastAnnouncementDate
```

### Becoming a CR
1. Any user creates a course: `POST /api/courses`
2. A student claims CR for an unclaimed course: `PUT /api/courses/:courseId/claim-cr`
3. Their role is promoted from `student` to `cr`
4. They are auto-enrolled in the course

---

## Token Economics

| Difficulty | Base Stake |
|---|---|
| Easy | 5 tokens |
| Medium | 10 tokens |
| Hard | 20 tokens |

**Modifiers:**
- **Credit weight:** `stake × (creditWeight / 5)`
- **Urgency (Path A):** based on days until event from task's scheduled date

| Days Until Event | Multiplier |
|---|---|
| > 14 days | ×1.0 (Normal) |
| 7–14 days | ×1.25 (Moderate) |
| 3–7 days | ×1.5 (High) |
| < 3 days | ×2.0 (Critical) |

Stake = Reward. Win X or lose X.

---

## Task Supersession

When a CR posts a **new announcement** whose generated tasks overlap with existing tasks on the same dates, the system automatically handles the collision:

1. **Identify overlap** — compute the date range of the new tasks and find all old `pending` tasks in that range for the same course.
2. **Protect active quizzes** — any old task with an active `QuizAttempt` (status `mcq_in_progress`) is **never** superseded. The student's in-progress quiz is safe.
3. **Supersede the rest** — old pending tasks without active attempts are marked `status: 'superseded'` with a `supersededBy` reference to the new announcement.
4. **Query filtering** — all task list endpoints (`/course/:id`, `/today/:id`, `/schedule/:id`) automatically exclude superseded tasks. Pass `?includeSuperseded=true` to see them.
5. **Quiz guard** — `POST /api/quiz/:taskId/start` returns **409 Conflict** if the task is superseded.

### Per-Student Binding (`assignedTo`)

Tasks have an optional `assignedTo` field (ObjectId → User). When `null` (default), the task is visible to **all** enrolled students. When set, it's a personal task for that student only.

Query endpoints accept `?userId=<id>` to filter: shows tasks where `assignedTo` is null **or** matches the given user.

### Weekly Fallback Supersession

When the Monday cron generates new weekly chapter tasks, it also supersedes any old fallback/sunday_revision tasks from the same week that are still pending (with the same active-quiz protection).

---

## Token Decay

- **Rate:** -20% every 3 days (compound)
- **Floor:** 1 token
- **Scope:** Tasks with deadline not yet passed

```
Stake: 20 → 16 → 13 → 10 → 8 → 6 → 5 → 4 → 3 → 2 (floor)
Days:  0     3     6     9    12   15   18   21   24   27
```

---

## Tolerance (Absence Protection)

Students earn a **grace period** proportional to their longest streak. Once the grace period is consumed, tokens bleed at an accelerating rate.

### How It Works

1. **Tolerance Cap** = `⌊2 + ln(1 + longestStreak) × 3⌋` grace days
2. Every day absent **within** the cap → no penalty (tolerance draining)
3. Every day **past** the cap → tokens bleed: `⌈2 × daysOver^1.5⌉` per day

| Longest Streak | Grace Days | Meaning |
|---|---|---|
| 0 | 2 | Everyone gets 2 days grace |
| 3 | 6 | +4 days from streaking |
| 7 | 8 | +6 days |
| 14 | 10 | +8 days |
| 30 | 12 | +10 days |

### Bleed Acceleration

| Days Past Tolerance | Daily Bleed |
|---|---|
| 1 | 2 tokens |
| 2 | 6 tokens |
| 3 | 11 tokens |
| 5 | 23 tokens |
| 7 | 38 tokens |

A student with 100 tokens and no streak loses everything in ~9 days of total absence (2 grace + 7 bleed).

### API

- `GET /api/auth/tolerance` — returns full tolerance status (cap, remaining, bleed rate, streak bonus)
- Login response includes `tolerance` object

### Cron

Runs daily at 1:00 AM. Creates `tolerance_bleed` ledger entries. Updates `stats.tokensLost` and recalculates reputation.

> **Full mathematical derivation:** see [MATHEMATICS.md §12](MATHEMATICS.md#12-tolerance-absence-protection)

---

## Path A — CR-Driven Day-by-Day Scheduling

When a CR posts an announcement, the system generates a complete study plan:

```
Example: Midterm in 15 days, topics = [Trees, Graphs, Hashing]

Pass 1 — LEARN (Days 1-6, ~40%):
  Day 1: Trees — fundamentals        Day 4: Trees — medium problems
  Day 2: Graphs — fundamentals       Day 5: Graphs — medium problems
  Day 3: Hashing — fundamentals      Day 6: Hashing — medium problems

Pass 2 — REVISE 1 (Days 7-11, ~35%):
  Day 7:  [REVISION 1] Trees       Day 10: [REVISION 1] Trees — hard
  Day 8:  [REVISION 1] Graphs      Day 11: [REVISION 1] Graphs — hard
  Day 9:  [REVISION 1] Hashing

Pass 3 — REVISE 2 (Days 12-15, ~25%):
  Day 12: [REVISION 2] Hashing — exam-style
  Day 13: [REVISION 2] Trees — mixed
  Day 14: [REVISION 2] Graphs — synthesis
  Day 15: [REVISION 2] Hashing — mock
```

---

## Path B — Auto-Pilot Weekly Chapters + Sunday Revision

### Monday: Weekly Chapter Tasks (Mon–Sat)

| Day | Difficulty | Goal |
|---|---|---|
| Mon-Tue | Easy | Introduce core concepts |
| Wed-Thu | Medium | Worked examples, practice |
| Fri-Sat | Hard | Complex problems, synthesis |

### Sunday: Spaced-Repetition Revision

- **Course rotation:** each Sunday picks 1 course per student (rotating index)
- **Chapter selection:** ≤5 chapters → revise all; >5 → pick 3-4 weighted
- **Weight:** `w(i) = 1 + √(i/n) × 3` — recent chapters ~4× more likely, old ones never forgotten

---

## Quiz Flow

```
Phase 1: MCQ (6 questions, 15s each)
  +2 correct / -1 skip / -2 wrong
  Pass threshold: ≥ 8/12

  Score ≥ 8 → tokens returned + reward earned → Phase 2
  Score < 8 → tokens forfeited → END

Phase 2: Theory (7 questions)
  Derivations, proofs, calculations
  Submit handwritten PDF
  AI grading pipeline (pending integration)
```

User stats (`stats.quizzesTaken`, `avgMcqScore`, etc.) are updated automatically.

---

## Focus Buddy (Chatbot)

| Capability | Examples |
|---|---|
| **Solve doubts** | "Explain recursion", "How does Dijkstra's work?" |
| **Emotional support** | "I'm stressed about exams", "I can't cope" |
| **Study coaching** | "What should I study today?" |
| **Motivation** | Uses real data: "You passed 8/10 quizzes!" |
| **Crisis referral** | Detects severe distress → professional resources |

**Mood detection:** happy, neutral, stressed, anxious, sad, frustrated, motivated
Non-neutral moods are saved to `user.wellbeing.moodHistory` (last 30, FIFO).

**Context (live from DB on each message):**
- Student profile, tokens, streak, department, semester
- Performance stats (tasks completed, quiz pass rate, avg MCQ score)
- Enrolled courses with chapter progress
- Today's tasks & upcoming deadlines
- Last 10 quiz results

---

## Cron Jobs

| Job | Schedule | Description |
|---|---|---|
| **Weekly Chapter Tasks** | Monday 6:00 AM | Mon–Sat tasks for next chapter (Path B) |
| **Sunday Revision** | Sunday 6:00 AM | Spaced-repetition, 1 course/student |
| **Token Decay** | Every 3 days, midnight | -20% on aging tasks |
| **Tolerance Decay** | Daily 1:00 AM | Check absent users, bleed tokens past grace period |

---

## Project Structure

```
backend/
├── package.json            # ESM ("type": "module"), v4.0
├── vitest.config.js        # Test runner configuration
├── .env.example
├── uploads/                # PDF uploads (books + theory submissions)
├── tests/
│   ├── setup.js            # MongoMemoryServer + env vars
│   ├── helpers.js          # App factory, token gen, data factories
│   ├── unit/
│   │   ├── models.test.js         # 51 tests — all 10 models
│   │   ├── pure-functions.test.js # 45 tests — urgency, tokens, schedule, mood
│   │   └── middleware.test.js     # 9 tests — protect, authorize, validate
│   ├── integration/
│   │   ├── auth.test.js           # 24 tests
│   │   ├── courses.test.js        # 21 tests
│   │   ├── announcements.test.js  # 12 tests
│   │   ├── tasks.test.js          # 12 tests
│   │   ├── quiz.test.js           # 23 tests
│   │   ├── theory.test.js         # 12 tests
│   │   ├── chat.test.js           # 18 tests
│   │   ├── reviews.test.js        # 19 tests — peer review lifecycle
│   │   └── leaderboard.test.js    # 7 tests — overall + course rankings
│   └── e2e/
│       └── workflows.test.js      # 4 tests — full user journeys
└── src/
    ├── app.js              # Express entry point + cron startup
    ├── config/
    │   └── db.js           # MongoDB connection
    ├── middleware/
    │   ├── auth.js         # JWT protect + role-based authorize
    │   └── validate.js     # express-validator rules (auth, course, announcement, quiz, chat, peer review)
    ├── models/
    │   ├── User.js         # Enriched: metadata, streak, stats, wellbeing, reputation, peer review stats
    │   ├── Course.js       # courseCode, book sub-doc, enrollment, chapterCount virtual
    │   ├── Task.js         # source (announcement/fallback/sunday_revision), status lifecycle
    │   ├── Announcement.js # CR-created events, createdBy, isActive
    │   ├── TheorySubmission.js # Theory PDFs with AI grading structure
    │   ├── QuizAttempt.js  # MCQ responses, course+theory refs
    │   ├── PeerReview.js   # NEW: upvote/downvote, dispute flow, AI verdict, token settlement
    │   ├── CourseProficiency.js # NEW: per-user per-course skill metrics
    │   ├── Conversation.js # Chat history with mood & category
    │   └── TokenLedger.js  # Immutable token transaction log (+ peer_wager/reward/penalty)
    ├── services/
    │   ├── aiTaskGenerator.js       # Path A: CR → 3-pass day-by-day tasks
    │   ├── fallbackTaskGenerator.js # Path B: Mon–Sat chapters + Sunday revision
    │   ├── questionGenerator.js     # Gemini → 6 MCQs + 7 theory Qs
    │   ├── arbitrationService.js    # NEW: Gemini AI dispute resolution
    │   ├── toleranceService.js      # NEW: Absence protection + streak-scaled grace
    │   ├── chatbot.js               # Focus Buddy + mood saving
    │   ├── chapterExtractor.js      # Parse chapters from PDF
    │   ├── tokenDecay.js            # -20% every 3 days
    │   ├── cronScheduler.js         # Cron orchestration
    │   └── pdfParser.js             # PDF text extraction
    ├── controllers/
    │   ├── authController.js        # Register (metadata), login (streak), profile, getMe
    │   ├── courseController.js       # CRUD, claim-cr, upload-book, enroll, students
    │   ├── announcementController.js # CR-only gating + AI task generation
    │   ├── taskController.js        # Task queries, schedule view
    │   ├── quizController.js        # Quiz lifecycle + stat tracking + proficiency
    │   ├── theoryController.js      # Theory submission management
    │   ├── peerReviewController.js  # NEW: upvote, downvote, dispute, AI arbitration
    │   ├── leaderboardController.js # NEW: overall + course leaderboards
    │   └── chatController.js        # Chatbot endpoints
    └── routes/
        ├── auth.js          # /register, /login, /me, /profile, /tolerance
        ├── courses.js       # CRUD, claim-cr, upload-book, enroll, students
        ├── announcements.js # /create (protected), /course/:id
        ├── tasks.js         # /course/:id, /today/:id, /schedule/:id, /:taskId
        ├── quiz.js          # /start, /answer, /mcq-result, /theory, /submit-theory
        ├── theory.js        # /submit, /submission, /my-submissions
        ├── reviews.js       # NEW: /upvote, /downvote, /:id/respond, /accomplished, /solution
        ├── leaderboard.js   # NEW: /overall, /course/:courseId
        └── chat.js          # /message, /conversations
```

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js** (ESM) | Runtime — ES Modules throughout |
| **Express 5.2** | HTTP framework |
| **MongoDB + Mongoose 9.2** | Database + ODM |
| **Google Generative AI** | Gemini for tasks, questions, chatbot |
| **JWT** (`jsonwebtoken`) | Authentication (7-day expiry) |
| **bcryptjs** | Password hashing (12 rounds) |
| **express-validator** | Input validation |
| **multer** | File uploads (PDF) |
| **pdf-parse** | PDF text extraction |
| **node-cron** | Scheduled background jobs |
| **helmet + cors** | Security headers + CORS |

---

## Security

- Passwords hashed with bcrypt (12 salt rounds)
- `passwordHash` excluded from all query results by default (`select: false`)
- JWT tokens expire after 7 days
- CR identity hidden in announcement GET responses (`select('-createdBy')`)
- MCQ correct answers **never** sent to client during quiz
- Server-side 15-second timer validation per MCQ (+ 2s network grace)
- CR-only gating: validates both role AND course ownership
- Helmet security headers enabled
- Input validation on all write endpoints via express-validator
- Upload directory auto-created, PDF-only file filter

---

## Testing

### Test Framework

- **Vitest** — fast ESM-native test runner
- **Supertest** — HTTP assertion library
- **mongodb-memory-server** — in-memory MongoDB for isolated tests
- **vi.mock()** — Gemini AI and questionGenerator mocked for determinism

### Running Tests

```bash
# Run all tests
npm test                    # vitest run (single pass)
npm run test:watch          # vitest (watch mode)
npm run test:coverage       # vitest run --coverage

# Legacy live tests (hit real Gemini API)
node live-test-all.js
```

### Test Results
            
**302 passed / 0 failed** across 15 test files

| Suite | Tests | Description |
|---|---|---|
| Unit: Models | 51 | All 10 Mongoose models (validation, methods, virtuals) |
| Unit: Pure Functions | 45 | Urgency, tokens, schedule builder, mood/category detection |
| Unit: Middleware | 9 | JWT protect, role authorize, express-validator |
| Integration: Auth | 24 | Register, login, profile CRUD, streak, duplicate checks |
| Integration: Courses | 21 | CRUD, claim-cr, enroll, upload-book, student list |
| Integration: Announcements | 12 | CR-only gating, task generation, filtering |
| Integration: Tasks | 12 | Course tasks, today, schedule, single task |
| Integration: Quiz | 23 | Full MCQ flow, scoring, theory generation, token settlement |
| Integration: Theory | 12 | PDF submission, attempt linking, my-submissions |
| Integration: Chat | 18 | Gemini mock, conversations, mood saving, CRUD |
| Integration: Reviews | 19 | Upvote, downvote, dispute (agree/disagree), AI arbitration |
| Integration: Leaderboard | 7 | Overall ranking, course ranking, pagination |
| Integration: Supersession | 17 | Task supersession, active quiz protection, query filtering |
| Integration: Tolerance | 28 | Tolerance cap, bleed math, API, cron penalty, streak scaling |
| E2E: Workflows | 4 | Full CR→student journey, token economy, multi-student |
