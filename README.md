# Focus Enhancer

> AI-powered academic task management & engagement platform for university students.

Focus Enhancer turns course announcements into structured, AI-generated study plans — complete with quizzes, theory assessments, peer review, an AI chatbot, direct messaging, and a token-based incentive economy. When no Course Representative is active, the system self-generates weekly chapter tasks and spaced-repetition revision from uploaded textbooks.

| Stack | Detail |
|-------|--------|
| Runtime | Node.js (ES Modules) |
| Framework | Express 5 |
| Database | MongoDB / Mongoose 9 |
| AI | Google Gemini (3-model cascade) |
| Auth | JWT (7-day expiry, bcrypt-12) |
| Tests | Vitest 4 · Supertest · mongodb-memory-server |

**Current version:** v4.2 — **340 tests** across 16 files (unit · integration · E2E).

---

## Table of Contents

1. [Quick Start](#quick-start)  
2. [Environment Variables](#environment-variables)  
3. [Project Structure](#project-structure)  
4. [Core Concepts](#core-concepts)  
5. [Services](#services)  
6. [API Reference](#api-reference)  
7. [Data Models](#data-models)  
8. [Cron Jobs](#cron-jobs)  
9. [Testing](#testing)  
10. [Architecture Notes](#architecture-notes)

---

## Quick Start

```bash
cd backend
npm install
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, GEMINI_API_KEY
npm run dev             # nodemon — auto-reloads on changes
```

| Script | Command | Purpose |
|--------|---------|---------|
| `start` | `node src/app.js` | Production |
| `dev` | `nodemon src/app.js` | Development (hot reload) |
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Watch mode |
| `test:coverage` | `vitest run --coverage` | With coverage |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | ✅ | — | MongoDB connection string |
| `JWT_SECRET` | ✅ | — | Secret for signing JWTs |
| `GEMINI_API_KEY` | ✅ | — | Google Generative AI API key |
| `PORT` | ❌ | `5000` | Server port |
| `GEMINI_MODEL` | ❌ | `gemini-2.0-flash-lite` | Primary Gemini model |
| `GEMINI_THROTTLE_MS` | ❌ | `10000` | Minimum ms between Gemini calls |

---

## Project Structure

```
backend/
├── src/
│   ├── app.js                    # Express setup, route mounting, middleware stack
│   ├── config/
│   │   └── db.js                 # MongoDB/Mongoose connection
│   ├── controllers/
│   │   ├── authController.js     # Register, login, profile, tolerance status
│   │   ├── announcementController.js  # CR announcements → AI task generation
│   │   ├── quizController.js     # MCQ start/answer/result, theory questions/submission
│   │   ├── taskController.js     # Course tasks, schedules, today's tasks
│   │   └── directChatController.js    # User-to-user messaging (request/accept/reject/send/end)
│   ├── middleware/
│   │   ├── auth.js               # JWT protect + role-based authorize
│   │   └── validate.js           # express-validator rules + handler
│   ├── models/                   # 10 Mongoose schemas (see Data Models)
│   ├── routes/                   # Express routers for each domain
│   └── services/
│       ├── geminiClient.js       # Shared Gemini client (throttle + 3-model cascade)
│       ├── aiTaskGenerator.js    # 3-pass announcement → task scheduling
│       ├── fallbackTaskGenerator.js  # Weekly chapter + Sunday revision (auto)
│       ├── questionGenerator.js  # MCQ + theory question generation via Gemini
│       ├── chatbot.js            # AI companion ("Focus Buddy")
│       ├── chapterExtractor.js   # PDF → chapter list extraction
│       ├── pdfParser.js          # PDF text extraction (full + topic-aware)
│       ├── tokenDecay.js         # Aging task value decay (20%/cycle)
│       └── cronScheduler.js      # Automated background jobs (node-cron)
├── tests/
│   ├── helpers.js                # Shared test utilities (app factory, token gen, etc.)
│   ├── unit/                     # Model validation, pure function, middleware tests
│   ├── integration/              # Route-level tests with in-memory MongoDB
│   └── e2e/                      # Multi-step workflow tests
└── uploads/                      # Stored PDFs (textbooks + theory submissions)
```

---

## Core Concepts

### Token Economy

Every student begins with **100 tokens**. Tokens are the universal currency:

- **Quiz stakes** — starting a quiz costs tokens (easy: 5, medium: 10, hard: 20). Passing returns the stake + a reward; failing forfeits the stake entirely.
- **Urgency multipliers** — deadlines < 3 days away multiply stakes by 2×; < 7 days by 1.5×.
- **Peer review wagers** — upvoting or downvoting a peer's work costs a wager. Win the dispute → earn tokens; lose → lose the wager.
- **Token decay** — tasks older than 3 days lose 20% of their stake/reward per cycle (minimum floor: 1 token).
- **Tolerance bleed** — absent users past their grace period lose tokens daily with accelerating severity.

### Three-Pass Scheduling

When a CR creates an announcement (e.g., "Midterm on Dec 15, covering Chapters 1–4"), the AI distributes study tasks across available days in three passes:

| Pass | Share | Purpose |
|------|-------|---------|
| Pass 1 | 40% of days | **Learn** — first exposure to each topic |
| Pass 2 | 35% | **Revise 1** — reinforce with different angles |
| Pass 3 | 25% | **Revise 2** — final consolidation |

Topics rotate round-robin within each pass. Each task includes a Gemini-generated description, difficulty rating, estimated duration, and token stake.

### Task Supersession

When a new announcement overlaps the date range of existing pending tasks, the old tasks are **superseded** (status → `superseded`). Tasks with active quiz attempts are protected from supersession.

### Peer Review & AI Arbitration

After passing the MCQ quiz and submitting handwritten theory solutions, a student's work is open for peer review:

1. **Upvote** — costs a wager; boosts the reviewee's reputation.
2. **Downvote** — costs a wager + requires a reason; triggers a dispute.
3. **Dispute resolution** — the reviewee can agree (tokens forfeited) or disagree (Gemini acts as impartial judge, analyzing the submission against the downvote reason).

### Course Representative (CR) System

The first enrolled student to claim the CR role for a course gets promoted. CRs can:
- Create announcements (which trigger AI task generation)
- Upload textbook PDFs (which enable chapter extraction for AI context)
- View enrolled student lists

### Automatic Fallback Tasks

For courses with no CR activity in 30+ days:
- **Monday**: 6 chapter-based tasks (Mon–Sat) covering the next unread chapter, with progressive difficulty.
- **Sunday**: Spaced-repetition revision — picks one rotating course per student, selects chapters using a recency-weighted formula, and generates 3–4 cross-chapter retention tasks.

---

## Services

### Gemini Client (`geminiClient.js`)

Centralized Google Gemini integration with:
- **10-second global throttle** — prevents quota exhaustion under concurrent requests.
- **3-model cascade** — `gemini-2.0-flash-lite` → `gemini-2.0-flash` → `gemini-flash-latest`. Automatically falls back on 429 (Resource Exhausted) errors.
- Two entry points: `generateContent(prompt)` for single-turn and `chatCompletion(history)` for multi-turn conversations.

### AI Task Generator (`aiTaskGenerator.js`)

Converts CR announcements into day-by-day study plans:
- Builds the 3-pass schedule across available weekdays.
- Sends detailed prompts to Gemini with textbook excerpts (via PDF parser), course metadata, credit weight, and event urgency.
- Calculates token stakes using difficulty + urgency multipliers.
- Clamps task durations: easy 1–2h, medium 2–3h, hard 3–4h (max 4h).

### Fallback Task Generator (`fallbackTaskGenerator.js`)

Autonomous chapter-based task generation:
- **Weekly (Monday)**: For inactive courses, generates 6 progressive tasks from the next chapter.
- **Sunday Revision**: Weighted random chapter selection — recent chapters score higher via `weight = max(1, 10 − index) × (1 + recency)`. Generates 3–4 cross-chapter retention tasks.
- Creates synthetic announcements and supersedes old fallback tasks.

### Question Generator (`questionGenerator.js`)

Gemini-powered assessment generation:
- `generateMCQs()` — 6 unique conceptual MCQs (4 options each, 15-second timer per question).
- `generateTheoryQuestions()` — 7 handwriting-required questions (2 easy + 3 medium + 2 hard): derivations, proofs, numericals, diagrams. 5–15 minutes each.

### Chatbot / Focus Buddy (`chatbot.js`)

Personalized AI student companion with three modes:
1. **Academic help** — concept explanations, doubt solving, step-by-step breakdowns.
2. **Emotional support** — mood detection (7 categories: happy, neutral, stressed, anxious, sad, frustrated, motivated), empathetic responses, crisis resource referrals.
3. **Study coaching** — progress tracking, weak-area identification, schedule suggestions.

On every message, the bot builds **live student context**: profile, enrolled courses with chapter progress, today's tasks, recent quiz scores, and upcoming deadlines.

### Token Decay (`tokenDecay.js`)

Aging incentive mechanism:
- Tasks older than 3 days with a future deadline lose **20% of stake/reward** per cycle (compound).
- Floor: 1 token (tasks never become free).
- Encourages prompt engagement rather than procrastination.

### Tolerance System (in `authController.js` + `cronScheduler.js`)

Absence protection with streak-based grace:

**Tolerance cap** (grace period in days):

$$T_{max}(s) = \lfloor 2 + \ln(1 + s) \times 3 \rfloor$$

where $s$ = user's longest login streak. Streak 0 → 2 days, streak 7 → 8 days, streak 30 → 12 days.

**Token bleed** (past tolerance):

$$\text{bleed}(d) = \lceil 2 \times d^{1.5} \rceil$$

where $d$ = days over tolerance. 1 day over → 2 tokens, 3 over → 11, 5 over → 23 tokens.

### Chapter Extractor (`chapterExtractor.js`)

Extracts chapter structure from textbook PDFs:
- Tries multiple heading patterns: "Chapter N", "Unit N", "Module N", "Section N.N", numbered headings.
- Falls back to splitting text into ~10 equal chunks if no headings are detected.
- `getChapterContent()` extracts text between chapter boundaries for AI context.

### PDF Parser (`pdfParser.js`)

Two extraction modes:
- `parsePdf(path)` — full text extraction via `pdf-parse`.
- `getRelevantContent(path, topics, maxChars)` — topic-aware extraction. Splits text by section boundaries, scores sections by topic keyword relevance, returns the most relevant sections up to `maxChars` (default 12,000).

### Cron Scheduler (`cronScheduler.js`)

Registers all automated background jobs (see [Cron Jobs](#cron-jobs)).

---

## API Reference

All routes return JSON with `{ success, message, data? }` structure. Protected routes require `Authorization: Bearer <token>`.

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | — | Register (grants 100 welcome tokens) |
| POST | `/login` | — | Login, update streak, return JWT |
| GET | `/me` | JWT | Current user profile with enrolled courses |
| PUT | `/profile` | JWT | Update profile (name, studentId, department, etc.) |
| GET | `/tolerance` | JWT | Tolerance/absence-protection status |

### Courses — `/api/courses`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | JWT | Create course |
| GET | `/` | — | List courses (filter: department, semester, year) |
| GET | `/:id` | JWT | Course details (CRs see enrolled student list) |
| PUT | `/:id/claim-cr` | JWT | Claim Course Representative role |
| POST | `/:id/upload-textbook` | JWT (CR) | Upload textbook PDF (max 50 MB) |
| POST | `/:id/enroll` | JWT | Self-enroll in course |
| GET | `/:id/students` | JWT (CR) | List enrolled students |

### Announcements — `/api/announcements`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | JWT (CR) | Create announcement → triggers AI task generation + supersession |
| GET | `/course/:courseId` | — | List active announcements for a course |

### Tasks — `/api/tasks` (protected)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/course/:courseId` | JWT | List tasks (filter: difficulty, type, date, pass, revision, etc.) |
| GET | `/course/:courseId/today` | JWT | Today's scheduled tasks |
| GET | `/course/:courseId/schedule` | JWT | Full day-by-day schedule |
| GET | `/:taskId` | JWT | Single task details |

### Quiz — `/api/quiz` (protected)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/:taskId/start` | JWT | Start quiz — generates 6 MCQs, deducts token stake |
| POST | `/:taskId/answer` | JWT | Answer one MCQ (timed: 15s + 2s grace) |
| GET | `/:taskId/mcq-result` | JWT | MCQ results — settles tokens (pass ≥ 8/12) |
| GET | `/:taskId/theory` | JWT | Get 7 theory questions (requires MCQ pass) |
| POST | `/:taskId/submit-theory` | JWT | Upload theory solutions PDF (max 20 MB) |

### Theory — `/api/theory`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/my-submissions` | JWT | List user's theory submissions (paginated) |
| POST | `/:taskId/submit` | JWT | Submit theory PDF |
| GET | `/:submissionId` | JWT | Get specific submission |

### Peer Reviews — `/api/reviews`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/accomplished/:userId` | — | View a user's accomplished tasks |
| GET | `/task/:taskId/theory` | JWT | View theory questions + PDF for review |
| POST | `/:taskId/upvote` | JWT | Upvote (costs wager tokens) |
| POST | `/:taskId/downvote` | JWT | Downvote with reason (triggers dispute) |
| POST | `/:reviewId/respond` | JWT | Respond: agree (forfeit tokens) or disagree (AI arbitration) |
| GET | `/given` | JWT | Reviews given by current user |
| GET | `/received` | JWT | Reviews received (includes pending dispute count) |

### AI Chatbot — `/api/chat` (protected)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/message` | JWT | Send message to Focus Buddy, get AI response |
| GET | `/conversations` | JWT | List conversations (paginated) |
| GET | `/conversations/:id` | JWT | Full conversation history |
| DELETE | `/conversations/:id` | JWT | Soft-delete conversation |

### Direct Chat — `/api/direct-chat` (protected)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/request` | JWT | Send chat request to another user |
| GET | `/requests/incoming` | JWT | Pending incoming requests |
| GET | `/requests/outgoing` | JWT | Pending outgoing requests |
| PUT | `/:id/accept` | JWT | Accept request (non-initiator only) |
| PUT | `/:id/reject` | JWT | Reject request (non-initiator only) |
| POST | `/:id/message` | JWT | Send a direct message |
| GET | `/` | JWT | List conversations (filter: `?status=active\|requested\|ended`) |
| GET | `/:id` | JWT | Conversation with messages |
| PUT | `/:id/end` | JWT | End conversation |

### Users — `/api/users` (protected)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/search?q=term` | JWT | Search users by name or email (min 2 chars, max 20 results) |

### Leaderboard — `/api/leaderboard`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/overall` | — | Global ranking (tokenBalance + reputation, paginated) |
| GET | `/course/:courseId` | — | Course-specific ranking (proficiencyScore) |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | `{ status: 'ok', version: '4.2' }` |

---

## Data Models

### User
Core student/CR profile with token balance, reputation, login streak, wellbeing history, and aggregate stats (quizzes passed, tasks completed, upvotes, etc.). Reputation is computed as:

$$\text{rep} = (up \times 10) - (downLost \times 15) + (downDefended \times 5) + (quizPassed \times 3) - \frac{tokensLost}{10} + (tasksCompleted \times 2)$$

### Course
Academic course with textbook PDF path, extracted chapters, duration type (full semester: 16 weeks / fractal: 8 weeks), weekly intensity (1–6), and CR assignment. Tracks last announcement date for fallback task activation.

### Task
Individual study task with title, description, topics, difficulty, duration, token stake/reward, scheduled/due dates, pass number (1/2/3), revision metadata, and supersession tracking. Statuses: `pending → in_progress → completed/expired/superseded`.

### Announcement
CR-created event (quiz/assignment/midterm/final/lecture/lab) linked to a course. Contains topics, event date, and flags for task generation status.

### QuizAttempt
Tracks a student's quiz session: 6 MCQ questions + answers, timing data, score, pass/fail, theory questions, submission path, and token settlement status. Statuses: `mcq_in_progress → mcq_completed → theory_pending → submitted/failed`.

### TheorySubmission
Handwritten theory solution upload with PDF path, grading status, individual question scores, and AI feedback.

### TokenLedger
Immutable audit trail of all token transactions: stakes, rewards, penalties, bonuses, peer wagers, tolerance bleeds. Records before-balance for full traceability.

### CourseProficiency
Per-student-per-course skill score computed from quizzes, reviews, and tasks. Used for course-specific leaderboards.

### Conversation (AI)
AI chatbot conversation with message history, mood detection, academic category, and soft-delete support.

### DirectConversation
User-to-user messaging with request/accept/reject flow, message history (capped at 500 FIFO), and participant tracking.

---

## Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Weekly Chapter Tasks | Monday 6:00 AM | Generate chapter-based tasks for courses with no CR activity in 30+ days |
| Sunday Revision | Sunday 6:00 AM | Spaced-repetition revision — 1 rotating course per student, recency-weighted chapter selection |
| Token Decay | Every 3 days, midnight | Reduce stake/reward of aging tasks by 20% (compound, min 1 token) |
| Tolerance Decay | Daily 1:00 AM | Penalise absent users past their streak-based grace period |

---

## Testing

```bash
npm test          # 340 tests, 16 files
npm run test:watch
npm run test:coverage
```

Tests use **mongodb-memory-server** for isolated, disposable databases — no external MongoDB required.

| Category | Files | Tests | Coverage |
|----------|-------|-------|----------|
| Unit — Models | 1 | 51 | Schema validation, password hashing, streak logic |
| Unit — Pure Functions | 1 | 45 | Decay formulas, scheduling, token math |
| Unit — Middleware | 1 | 9 | JWT verification, role authorization |
| Integration — Auth | 1 | 24 | Registration, login, profile, streak, tolerance |
| Integration — Courses | 1 | 21 | CRUD, CR claim, enrollment, textbook upload |
| Integration — Announcements | 1 | 12 | CR creation, task generation, filtering |
| Integration — Tasks | 1 | 12 | Listing, filtering, scheduling endpoints |
| Integration — Quiz | 1 | 23 | Full quiz flow: start → answer → result → theory → submit |
| Integration — Theory | 1 | 12 | PDF submission, duplicate rejection |
| Integration — Chat (AI) | 1 | 18 | Chatbot messaging, conversations, deletion |
| Integration — Reviews | 1 | 19 | Upvote/downvote, disputes, AI arbitration |
| Integration — Leaderboard | 1 | 7 | Global + course rankings, pagination |
| Integration — Supersession | 1 | 17 | Task supersession, protection logic |
| Integration — Tolerance | 1 | 28 | Grace period, bleed calculation, edge cases |
| Integration — Direct Chat | 1 | 38 | Request/accept/reject, messaging, lifecycle |
| E2E — Workflows | 1 | 4 | Multi-step flows: announcement→quiz→theory, chatbot, multi-student |

---

## Architecture Notes

- **Middleware stack**: helmet → cors → JSON parser → URL parser → static files → routes → 404 → error handler.
- **Auth enforcement**: `protect` middleware applied at the router level for quiz, task, chat, and direct-chat routes. Auth and course routes handle protection per-endpoint.
- **Gemini resilience**: All AI calls go through a single throttled client with automatic model cascade on quota errors — no individual service manages API rate limits.
- **File uploads**: Handled via `multer` (memory + disk storage). Textbooks: max 50 MB. Theory PDFs: max 20 MB. Stored in `backend/uploads/`.
- **Token immutability**: All balance changes are double-entry — the `TokenLedger` records every transaction with before-balance for full audit trail.
- **ES Modules**: The entire codebase uses `import`/`export` (no CommonJS). `"type": "module"` in `package.json`.

---

## License

See [LICENSE](LICENSE) for details.
