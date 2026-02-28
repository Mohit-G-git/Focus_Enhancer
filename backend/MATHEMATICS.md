# Focus Enhancer — Mathematical Foundation

> Every formula, algorithm, constant, and numerical decision powering the platform, extracted directly from source code and presented in formal notation.

---

## Table of Contents

- [1. Token Economics](#1-token-economics)
  - [1.1 Base Stakes](#11-base-stakes)
  - [1.2 Credit Weight Factor](#12-credit-weight-factor)
  - [1.3 Urgency Multiplier](#13-urgency-multiplier)
  - [1.4 Final Token Computation](#14-final-token-computation)
  - [1.5 Fallback Token Stake (No Urgency)](#15-fallback-token-stake-no-urgency)
  - [1.6 Initial Token Endowment](#16-initial-token-endowment)
- [2. Token Decay](#2-token-decay)
  - [2.1 Decay Schedule](#21-decay-schedule)
  - [2.2 Compound Decay Model](#22-compound-decay-model)
  - [2.3 Applied Decay (Per Cycle)](#23-applied-decay-per-cycle)
  - [2.4 Worked Example](#24-worked-example)
- [3. Schedule Construction](#3-schedule-construction)
  - [3.1 Three-Pass Day Split](#31-three-pass-day-split)
  - [3.2 Topic Assignment (Round-Robin)](#32-topic-assignment-round-robin)
  - [3.3 Worked Example](#33-worked-example)
  - [3.4 Task Count Per Event Type](#34-task-count-per-event-type)
  - [3.5 Duration Bounds](#35-duration-bounds)
- [4. Weekly Fallback Schedule](#4-weekly-fallback-schedule)
  - [4.1 Difficulty Progression](#41-difficulty-progression)
  - [4.2 Monday Anchor Computation](#42-monday-anchor-computation)
- [5. Spaced Repetition (Sunday Revision)](#5-spaced-repetition-sunday-revision)
  - [5.1 Chapter Weight Function](#51-chapter-weight-function)
  - [5.2 Selection Probability](#52-selection-probability)
  - [5.3 Weighted Random Sampling Without Replacement](#53-weighted-random-sampling-without-replacement)
  - [5.4 Course Rotation Index](#54-course-rotation-index)
  - [5.5 Worked Example](#55-worked-example)
- [6. Quiz Scoring](#6-quiz-scoring)
  - [6.1 Point Values](#61-point-values)
  - [6.2 Score Computation](#62-score-computation)
  - [6.3 Time Constraint](#63-time-constraint)
  - [6.4 Pass/Fail Determination](#64-passfail-determination)
  - [6.5 Token Settlement on Quiz Result](#65-token-settlement-on-quiz-result)
  - [6.6 Running MCQ Average](#66-running-mcq-average)
- [7. Peer Review Token Settlement](#7-peer-review-token-settlement)
  - [7.1 Upvote](#71-upvote)
  - [7.2 Downvote → Agree](#72-downvote--agree)
  - [7.3 Downvote → Disagree → AI Arbitration](#73-downvote--disagree--ai-arbitration)
  - [7.4 Settlement Matrix](#74-settlement-matrix)
- [8. Reputation Score](#8-reputation-score)
  - [8.1 Formula](#81-formula)
  - [8.2 Weight Interpretation](#82-weight-interpretation)
  - [8.3 Worked Example](#83-worked-example)
- [9. Course Proficiency Score](#9-course-proficiency-score)
  - [9.1 Formula](#91-formula)
  - [9.2 Comparison with Reputation](#92-comparison-with-reputation)
- [10. Leaderboard Ranking](#10-leaderboard-ranking)
  - [10.1 Overall Leaderboard](#101-overall-leaderboard)
  - [10.2 Course Leaderboard](#102-course-leaderboard)
  - [10.3 Pagination](#103-pagination)
- [11. Streak Algorithm](#11-streak-algorithm)
  - [11.1 State Machine](#111-state-machine)
  - [11.2 Longest Streak](#112-longest-streak)
- [12. Tolerance (Absence Protection)](#12-tolerance-absence-protection)
  - [12.1 Tolerance Cap — Logarithmic Streak Scaling](#121-tolerance-cap--logarithmic-streak-scaling)
  - [12.2 Token Bleed — Super-Linear Penalty](#122-token-bleed--super-linear-penalty)
  - [12.3 Combined System — Phase Diagram](#123-combined-system--phase-diagram)
  - [12.4 Worked Example](#124-worked-example)
  - [12.5 Bleed Half-Life](#125-bleed-half-life)
- [13. Mood Tracking](#13-mood-tracking)
- [14. Supersession Logic](#14-supersession-logic)
  - [14.1 Protection Predicate](#141-protection-predicate)
- [15. Constants Reference Table](#15-constants-reference-table)
- [16. System of Equations — Full Token Flow](#16-system-of-equations--full-token-flow)

---

## 1. Token Economics

### 1.1 Base Stakes

Every task has a base token value determined solely by difficulty:

| Difficulty | $B_d$ |
|:---:|:---:|
| easy | $5$ |
| medium | $10$ |
| hard | $20$ |

> Source: `aiTaskGenerator.js`, `fallbackTaskGenerator.js`

### 1.2 Credit Weight Factor

Courses carry a credit weight $c \in [1, 6]$, normalized against a midpoint of $5$:

$$
W_c = \frac{\text{clamp}(c,\;1,\;10)}{5}
$$

This produces $W_c \in [0.2,\; 2.0]$. A 3-credit course gives $W_c = 0.6$; a 5-credit course gives $W_c = 1.0$.

### 1.3 Urgency Multiplier

Urgency is a step function of the number of days remaining until the event:

$$
\delta = \max\!\left(0,\; \frac{t_{\text{event}} - t_{\text{now}}}{86{,}400{,}000}\right)
$$

$$
U(\delta) = \begin{cases}
2.0  & \text{if } \delta < 3 \quad (\text{critical})\\
1.5  & \text{if } 3 \leq \delta < 7 \quad (\text{high})\\
1.25 & \text{if } 7 \leq \delta \leq 14 \quad (\text{moderate})\\
1.0  & \text{if } \delta > 14 \quad (\text{normal})
\end{cases}
$$

> Source: `calculateUrgency()` in `aiTaskGenerator.js`

### 1.4 Final Token Computation

For a CR-driven (Path A) task:

$$
\boxed{S = \text{round}(B_d \times W_c \times U)}
$$

$$
R = S \qquad \text{(reward equals stake — symmetric risk)}
$$

Where $S$ is the token stake and $R$ is the reward.

**Example:** A *hard* task in a 4-credit course, 5 days before event:

$$
S = \text{round}(20 \times \tfrac{4}{5} \times 1.5) = \text{round}(24) = 24 \text{ tokens}
$$

### 1.5 Fallback Token Stake (No Urgency)

Fallback (Path B) tasks always use $U = 1.0$:

$$
S_{\text{fallback}} = \text{round}(B_d \times W_c)
$$

### 1.6 Initial Token Endowment

Every new user starts with:

$$
\tau_0 = 100 \text{ tokens}
$$

---

## 2. Token Decay

### 2.1 Decay Schedule

Token decay runs as a cron job every **3 days** at midnight. It targets tasks that:

- Have a deadline in the future ($t_{\text{deadline}} \geq t_{\text{now}}$)
- Were created more than 3 days ago ($t_{\text{created}} < t_{\text{now}} - 3 \times 86400000$)
- Still have $S > 1$ (above the floor)

### 2.2 Compound Decay Model

The theoretical compound decay after $n$ cycles:

$$
S(n) = S_0 \cdot (1 - r)^n = S_0 \cdot 0.80^n
$$

Where $r = 0.20$ is the decay rate and $n = \left\lfloor \frac{\text{age\_ms}}{3 \times 86400000} \right\rfloor$.

### 2.3 Applied Decay (Per Cycle)

Each cycle, the system applies a single 20% reduction:

$$
S_{\text{new}} = \max\!\left(1,\; \text{round}(S_{\text{current}} \times 0.80)\right)
$$

$$
R_{\text{new}} = S_{\text{new}}
$$

The minimum floor ensures no task ever becomes free ($S \geq 1$).

### 2.4 Worked Example

A medium task ($S_0 = 10$) decaying over time:

| Cycle $n$ | Days Old | $S$ | $R$ |
|:---:|:---:|:---:|:---:|
| $0$ | $0$ | $10$ | $10$ |
| $1$ | $3$ | $8$ | $8$ |
| $2$ | $6$ | $6$ | $6$ |
| $3$ | $9$ | $5$ | $5$ |
| $4$ | $12$ | $4$ | $4$ |
| $5$ | $15$ | $3$ | $3$ |
| $6$ | $18$ | $2$ | $2$ |
| $7$ | $21$ | $2$ | $2$ |
| $8$ | $24$ | $2$ | $2$ |
| $9$ | $27$ | $2$ | $2$ |
| $10$ | $30$ | $1$ | $1$ |

The half-life is approximately $\frac{\ln 2}{\ln(1/0.8)} \times 3 \approx 9.3$ days.

---

## 3. Schedule Construction

### 3.1 Three-Pass Day Split

Given $T$ total available days (event day excluded):

$$
T = \max\!\left(1,\; \text{round}\!\left(\frac{t_{\text{event}} - t_{\text{start}}}{86400000}\right)\right)
$$

The days are partitioned into three passes for progressive learning:

$$
P_1 = \max(1,\;\text{round}(0.40 \cdot T)) \quad \text{(LEARN — 40\%)}
$$

$$
P_2 = \max(1,\;\text{round}(0.35 \cdot T)) \quad \text{(REVISE-1 — 35\%)}
$$

$$
P_3 = \max(1,\;T - P_1 - P_2) \quad \text{(REVISE-2 — remainder)}
$$

Note: Due to rounding and the $\max(1, \ldots)$ constraints, the actual percentages may deviate slightly, especially for small $T$.

### 3.2 Topic Assignment (Round-Robin)

Within pass $p$ with $P_p$ days and $K = |\text{topics}|$:

$$
\text{topic}(d) = \text{topics}[d \bmod K] \qquad \text{for } d = 0, 1, \ldots, P_p - 1
$$

This ensures each topic receives approximately $\lceil P_p / K \rceil$ days per pass.

### 3.3 Worked Example

**Input:** 3 topics `[Trees, Graphs, Hashing]`, event in 15 days.

$$
T = 15, \quad P_1 = \text{round}(6.0) = 6, \quad P_2 = \text{round}(5.25) = 5, \quad P_3 = 15 - 6 - 5 = 4
$$

| Day | Pass | Topic |
|:---:|:---:|:---:|
| 0 | 1 (Learn) | Trees |
| 1 | 1 (Learn) | Graphs |
| 2 | 1 (Learn) | Hashing |
| 3 | 1 (Learn) | Trees |
| 4 | 1 (Learn) | Graphs |
| 5 | 1 (Learn) | Hashing |
| 6 | 2 (Revise-1) | Trees |
| 7 | 2 (Revise-1) | Graphs |
| 8 | 2 (Revise-1) | Hashing |
| 9 | 2 (Revise-1) | Trees |
| 10 | 2 (Revise-1) | Graphs |
| 11 | 3 (Revise-2) | Trees |
| 12 | 3 (Revise-2) | Graphs |
| 13 | 3 (Revise-2) | Hashing |
| 14 | 3 (Revise-2) | Trees |

Each topic appears: Pass 1 → 2 days, Pass 2 → 1–2 days, Pass 3 → 1–2 days.

### 3.4 Task Count Per Event Type

A guidance constant (not a hard limit — AI generates per schedule):

| Event Type | Expected Tasks |
|:---:|:---:|
| lecture | $2$ |
| quiz | $3$ |
| lab | $3$ |
| assignment | $4$ |
| midterm | $6$ |
| final | $8$ |
| (default) | $4$ |

### 3.5 Duration Bounds

Tasks have maximum durations tied to difficulty:

| Difficulty | Duration Range (hours) | Hard Max |
|:---:|:---:|:---:|
| easy | $[1, 2]$ | $4$ |
| medium | $[2, 3]$ | $4$ |
| hard | $[3, 4]$ | $4$ |

$$
h_{\text{final}} = \min(h_{\text{ai}},\; 4)
$$

---

## 4. Weekly Fallback Schedule

When no CR is active (no announcements in 30 days), the Monday cron generates a 6-day plan (Mon–Sat) for the next textbook chapter.

### 4.1 Difficulty Progression

| Day Index $d$ | Weekday | Difficulty |
|:---:|:---:|:---:|
| $0$ | Mon | easy |
| $1$ | Tue | easy |
| $2$ | Wed | medium |
| $3$ | Thu | medium |
| $4$ | Fri | hard |
| $5$ | Sat | hard |

Formally:

$$
\text{difficulty}(d) = \begin{cases}
\text{easy}   & \text{if } d \leq 1 \\
\text{medium} & \text{if } 2 \leq d \leq 3 \\
\text{hard}   & \text{if } d \geq 4
\end{cases}
$$

### 4.2 Monday Anchor Computation

To find "this Monday" from the current date:

$$
\text{offset} = \begin{cases}
6 & \text{if weekday} = 0 \;(\text{Sunday}) \\
\text{weekday} - 1 & \text{otherwise}
\end{cases}
$$

$$
t_{\text{Monday}} = t_{\text{now}} - \text{offset} \times 86400000
$$

$$
t_{\text{Sunday}} = t_{\text{Monday}} + 6 \times 86400000
$$

---

## 5. Spaced Repetition (Sunday Revision)

### 5.1 Chapter Weight Function

For $N$ covered chapters indexed $i = 0$ (oldest) to $N-1$ (newest):

$$
\boxed{w_i = 1 + \sqrt{\frac{i}{N}} \times 3}
$$

**Properties:**

- $w_0 = 1$ (oldest chapter — minimum weight, never zero)
- $w_{N-1} = 1 + 3\sqrt{\frac{N-1}{N}} \to 4$ as $N \to \infty$
- The ratio $\frac{w_{N-1}}{w_0} \to 4$, meaning the newest chapter is at most $4\times$ more likely than the oldest
- Uses the square root function for a concave (diminishing returns) curve — recency is important but not overwhelmingly so

### 5.2 Selection Probability

The probability of selecting chapter $i$ in the first draw:

$$
P(i) = \frac{w_i}{\sum_{j=0}^{N-1} w_j}
$$

The total weight:

$$
W = \sum_{i=0}^{N-1} w_i = N + 3\sum_{i=0}^{N-1}\sqrt{\frac{i}{N}}
$$

For large $N$, the sum approximates:

$$
\sum_{i=0}^{N-1}\sqrt{\frac{i}{N}} \approx \int_0^1 \sqrt{x}\,dx \cdot N = \frac{2}{3}N
$$

$$
W \approx N + 3 \cdot \frac{2}{3}N = 3N
$$

### 5.3 Weighted Random Sampling Without Replacement

The algorithm selects $k = \min(4, N)$ chapters:

```
available ← [(ch₀, w₀), (ch₁, w₁), ..., (chₙ₋₁, wₙ₋₁)]
selected ← []

for pick = 1 to k:
    W ← Σ weights in available
    r ← uniform_random(0, W)
    cumulative ← 0
    for j = 0 to |available| - 1:
        cumulative += available[j].weight
        if cumulative ≥ r:
            selected.append(available[j].chapter)
            remove available[j]
            break

return selected
```

**Special case:** If $N \leq k$, return all chapters (full revision).

### 5.4 Course Rotation Index

Each student has a persistent `sundayRevisionCourseIndex`. On each Sunday:

$$
\text{idx} = \text{sundayRevisionCourseIndex} \bmod |\text{courses}|
$$

$$
\text{sundayRevisionCourseIndex}_{\text{next}} = (\text{idx} + 1) \bmod |\text{courses}|
$$

With $C$ courses and 4 Sundays per month, each course is revised approximately every $\lceil C/4 \rceil$ weeks.

### 5.5 Worked Example

A student has studied 10 chapters. Weights:

| Chapter $i$ | $w_i = 1 + 3\sqrt{i/10}$ | Approx |
|:---:|:---:|:---:|
| 0 (oldest) | $1 + 0$ | $1.00$ |
| 1 | $1 + 0.949$ | $1.95$ |
| 2 | $1 + 1.342$ | $2.34$ |
| 3 | $1 + 1.643$ | $2.64$ |
| 4 | $1 + 1.897$ | $2.90$ |
| 5 | $1 + 2.121$ | $3.12$ |
| 6 | $1 + 2.324$ | $3.32$ |
| 7 | $1 + 2.510$ | $3.51$ |
| 8 | $1 + 2.683$ | $3.68$ |
| 9 (newest) | $1 + 2.846$ | $3.85$ |

Total weight $W = \sum w_i \approx 28.31$.

Probability of Ch. 9 (newest) being picked first: $\frac{3.85}{28.31} \approx 13.6\%$.

Probability of Ch. 0 (oldest) being picked first: $\frac{1.00}{28.31} \approx 3.5\%$.

Ratio: $\frac{P(9)}{P(0)} = 3.85$ — the newest chapter is ~$3.85\times$ more likely, but the oldest still has a meaningful chance.

---

## 6. Quiz Scoring

### 6.1 Point Values

Each quiz has exactly $Q = 6$ MCQ questions.

| Outcome | Points $p_i$ |
|:---:|:---:|
| Correct | $+2$ |
| Wrong | $-2$ |
| Unattempted / Timeout | $-1$ |

### 6.2 Score Computation

$$
\text{score} = \sum_{i=0}^{5} p_i
$$

**Score range:** $[-12,\; +12]$ where:

- Perfect score: $6 \times (+2) = +12$
- All wrong: $6 \times (-2) = -12$
- All skipped: $6 \times (-1) = -6$

### 6.3 Time Constraint

Each question $i$ (0-indexed) must be answered within a cumulative time budget:

$$
t_{\text{max}}(i) = (i + 1) \times (T_{\text{limit}} + T_{\text{grace}}) = (i + 1) \times 17{,}000 \text{ ms}
$$

Where $T_{\text{limit}} = 15{,}000$ ms and $T_{\text{grace}} = 2{,}000$ ms.

| Question | Cumulative Max Time |
|:---:|:---:|
| $Q_0$ | 17s |
| $Q_1$ | 34s |
| $Q_2$ | 51s |
| $Q_3$ | 68s |
| $Q_4$ | 85s |
| $Q_5$ | 102s |

If the elapsed time from quiz start exceeds $t_{\text{max}}(i)$, the answer is treated as unattempted ($p_i = -1$).

### 6.4 Pass/Fail Determination

$$
\text{passed} = \begin{cases}
\text{true}  & \text{if } \text{score} \geq 8 \\
\text{false} & \text{otherwise}
\end{cases}
$$

The threshold $\theta = 8$ requires at least $4$ correct answers with $0$ wrong and $2$ skipped, or equivalently:

$$
2c - 2w - s \geq 8, \quad c + w + s = 6, \quad c, w, s \geq 0
$$

Minimum to pass: $c \geq 4$ with $w = 0, s = 2$ (score $= 8 - 2 = 6$... actually that's only $6$). More precisely: $c = 5, w = 0, s = 1$ gives $10 - 1 = 9$. Or $c = 4, w = 0, s = 2$ gives $8 - 2 = 6 < 8$. So realistically:

- 6/6 correct → $12$ ✓
- 5/6 correct, 1 skip → $10 - 1 = 9$ ✓
- 5/6 correct, 1 wrong → $10 - 2 = 8$ ✓
- 4/6 correct, 2 skip → $8 - 2 = 6$ ✗
- 4/6 correct, 1 wrong, 1 skip → $8 - 2 - 1 = 5$ ✗

**Minimum passing configuration:** 5 correct + 1 wrong/skip.

### 6.5 Token Settlement on Quiz Result

| Result | Balance Change |
|:---:|:---|
| **Pass** | $+S + R = +2S$ (stake returned + reward) |
| **Fail** | $0$ (stake forfeited, already deducted) |

Net effect:

$$
\Delta\tau = \begin{cases}
+S & \text{if passed (net profit)} \\
-S & \text{if failed (net loss)}
\end{cases}
$$

### 6.6 Running MCQ Average

After the $n$-th quiz with score $s_n$:

$$
\overline{s}_n = \frac{\overline{s}_{n-1} \times (n-1) + s_n}{n}
$$

Stored with 2-decimal precision:

$$
\overline{s}_n^{\text{stored}} = \frac{\text{round}(\overline{s}_n \times 100)}{100}
$$

---

## 7. Peer Review Token Settlement

### 7.1 Upvote

The reviewer pays a wager $w$ and receives nothing back. The upvote boosts the reviewee's reputation.

| Party | Token Change |
|:---:|:---|
| Reviewer | $-w$ (wager cost) |
| Reviewee | $0$ (no direct token change) |

### 7.2 Downvote → Agree

The reviewee accepts the downvote.

| Party | Token Change |
|:---:|:---|
| Reviewee | $-S_{\text{task}}$ (loses task stake) |
| Reviewer (downvoter) | $+w + w = +2w$ (wager returned + reward equal to wager) |

### 7.3 Downvote → Disagree → AI Arbitration

**If AI sides with the downvoter:**

| Party | Token Change |
|:---:|:---|
| Reviewee | $-S_{\text{task}}$ |
| Reviewer | $+2w$ |

**If AI sides with the reviewee:**

| Party | Token Change |
|:---:|:---|
| Reviewee | $0$ (keeps tokens, +1 `downvotesDefended`) |
| Reviewer | $0$ (wager permanently forfeited) |

### 7.4 Settlement Matrix

$$
\begin{array}{|l|c|c|}
\hline
\textbf{Scenario} & \Delta\tau_{\text{reviewee}} & \Delta\tau_{\text{reviewer}} \\
\hline
\text{Upvote} & 0 & -w \\
\text{Agree} & -S_{\text{task}} & +2w \\
\text{AI → downvoter wins} & -S_{\text{task}} & +2w \\
\text{AI → reviewee wins} & 0 & 0 \text{ (wager lost at cast time)} \\
\hline
\end{array}
$$

Note: The reviewer's wager $w$ is deducted at the time of casting the review (both upvote and downvote). The "+2w" in the agree/AI-wins-downvoter cases represents the wager being returned plus an equal bonus.

---

## 8. Reputation Score

### 8.1 Formula

$$
\boxed{
\rho = \max\!\left(0,\;\text{round}\!\left(
  10u - 15d_L + 5d_D + 3q_P - \frac{\tau_L}{10} + 2t_C
\right)\right)
}
$$

Where:

| Symbol | Meaning | Source |
|:---:|:---|:---|
| $u$ | Upvotes received | `stats.upvotesReceived` |
| $d_L$ | Downvotes lost (fault confirmed) | `stats.downvotesLost` |
| $d_D$ | Downvotes defended (AI sided with you) | `stats.downvotesDefended` |
| $q_P$ | Quizzes passed | `stats.quizzesPassed` |
| $\tau_L$ | Total tokens lost | `stats.tokensLost` |
| $t_C$ | Tasks completed | `stats.tasksCompleted` |

### 8.2 Weight Interpretation

| Factor | Coefficient | Interpretation |
|:---:|:---:|:---|
| Upvote received | $+10$ | Strong positive — peer validation |
| Downvote lost | $-15$ | Severe penalty — confirmed low quality |
| Downvote defended | $+5$ | Moderate reward — stood ground correctly |
| Quiz passed | $+3$ | Consistent effort signal |
| Tokens lost | $-0.1$ | Gentle drag from accumulated failures |
| Task completed | $+2$ | Participation credit |

### 8.3 Worked Example

A student with: $u=5$, $d_L=1$, $d_D=2$, $q_P=10$, $\tau_L=30$, $t_C=15$:

$$
\rho = \max\!\left(0,\;\text{round}(50 - 15 + 10 + 30 - 3 + 30)\right) = \max(0,\; 102) = 102
$$

---

## 9. Course Proficiency Score

### 9.1 Formula

Per-user per-course metric:

$$
\boxed{
\pi = \max\!\left(0,\;
  10u - 15d_L + 5d_D + 3t_C - 2q_F + 5q_P
\right)
}
$$

Where all variables are **course-scoped** (not global):

| Symbol | Meaning |
|:---:|:---|
| $u$ | Upvotes received in this course |
| $d_L$ | Downvotes lost in this course |
| $d_D$ | Downvotes defended in this course |
| $t_C$ | Tasks completed in this course |
| $q_F$ | Quizzes failed in this course |
| $q_P$ | Quizzes passed in this course |

### 9.2 Comparison with Reputation

| | Reputation $\rho$ | Proficiency $\pi$ |
|:---:|:---:|:---:|
| **Scope** | Global (all courses) | Per course |
| **Includes** | $\tau_L$ (tokens lost) | $q_F$ (quizzes failed) |
| **Missing** | $q_F$ | $\tau_L$ |
| **Quiz weight** | $+3$ (pass only) | $+5$ (pass), $-2$ (fail) |
| **Task weight** | $+2$ | $+3$ |
| **Used in** | Overall leaderboard | Course leaderboard |

---

## 10. Leaderboard Ranking

### 10.1 Overall Leaderboard

Primary sort: token balance (descending). Tiebreaker: reputation (descending).

$$
\text{rank}(u) = \text{position in } \text{sort}(\text{Users},\; \tau \downarrow,\; \rho \downarrow)
$$

### 10.2 Course Leaderboard

Sort by proficiency score (descending):

$$
\text{rank}(u, c) = \text{position in } \text{sort}(\text{Proficiencies}_c,\; \pi \downarrow)
$$

### 10.3 Pagination

For page $p$ with limit $l$:

$$
\text{skip} = (p - 1) \times l
$$

$$
\text{rank}_i = \text{skip} + i + 1 \qquad \text{for } i = 0, 1, \ldots, l-1
$$

---

## 11. Streak Algorithm

### 11.1 State Machine

On each quiz completion (or task activity), the streak is updated:

$$
\Delta d = \text{round}\!\left(\frac{t_{\text{today}} - t_{\text{last}}}{86400000}\right)
$$

$$
\text{currentDays} \leftarrow \begin{cases}
\text{currentDays} & \text{if } \Delta d = 0 \quad \text{(already counted today)}\\
\text{currentDays} + 1 & \text{if } \Delta d = 1 \quad \text{(consecutive day)}\\
1 & \text{if } \Delta d > 1 \quad \text{(streak broken, restart)}
\end{cases}
$$

### 11.2 Longest Streak

$$
\text{longestStreak} = \max(\text{longestStreak},\; \text{currentDays})
$$

This is a monotonically non-decreasing value — once set, it can only grow.

---

## 12. Tolerance (Absence Protection)

Students earn a **grace period** (tolerance buffer) proportional to their best streak. Once the buffer is exhausted, tokens bleed at an accelerating rate — gentle at first, punishing if neglected.

### 12.1 Tolerance Cap — Logarithmic Streak Scaling

The maximum number of grace days a student can be absent without penalty:

$$
\boxed{T_{\max}(s) = \left\lfloor \beta + \ln(1 + s) \cdot \lambda \right\rfloor}
$$

Where $\beta = 2$ (base tolerance), $\lambda = 3$ (log scale factor), and $s$ = longest streak ever achieved.

**Properties:**
- $T_{\max}(0) = 2$ — everyone gets at least 2 days grace
- Logarithmic growth: early streaks are highly rewarded, diminishing returns after ~30 days
- Uses `longestStreak` (not current), so past effort is never lost

| Longest Streak $s$ | $\ln(1+s) \times 3$ | $T_{\max}$ | Grace Days Gained |
|:---:|:---:|:---:|:---:|
| $0$ | $0$ | $2$ | — |
| $1$ | $2.08$ | $4$ | $+2$ |
| $3$ | $4.16$ | $6$ | $+4$ |
| $7$ | $6.24$ | $8$ | $+6$ |
| $14$ | $8.12$ | $10$ | $+8$ |
| $30$ | $10.30$ | $12$ | $+10$ |
| $60$ | $12.30$ | $14$ | $+12$ |
| $100$ | $13.86$ | $15$ | $+13$ |

The streak bonus (grace days above the base 2):

$$
\text{streakBonus}(s) = T_{\max}(s) - \beta = \left\lfloor \ln(1 + s) \cdot 3 \right\rfloor
$$

### 12.2 Token Bleed — Super-Linear Penalty

When a student has been absent for $d$ days and their tolerance cap is $T_{\max}$:

$$
d_{\text{over}} = \max(0,\; d_{\text{absent}} - T_{\max})
$$

The daily token bleed (applied by the cron once per day):

$$
\boxed{\text{bleed}(d_{\text{over}}) = \begin{cases}
0 & \text{if } d_{\text{over}} \leq 0 \\
\left\lceil \alpha \cdot d_{\text{over}}^{\,1.5} \right\rceil & \text{if } d_{\text{over}} > 0
\end{cases}}
$$

Where $\alpha = 2$ (bleed coefficient) and the exponent $1.5$ creates super-linear acceleration.

| Days Over Tolerance | $\alpha \cdot d^{1.5}$ | Bleed (tokens) | Cumulative |
|:---:|:---:|:---:|:---:|
| $1$ | $2.00$ | $2$ | $2$ |
| $2$ | $5.66$ | $6$ | $8$ |
| $3$ | $10.39$ | $11$ | $19$ |
| $4$ | $16.00$ | $16$ | $35$ |
| $5$ | $22.36$ | $23$ | $58$ |
| $7$ | $37.04$ | $38$ | $134$ |
| $10$ | $63.25$ | $64$ | $\sim 300$ |

**Rate of acceleration:**

$$
\frac{d}{dx}\left[\alpha x^{1.5}\right] = 1.5\alpha\, x^{0.5} = 3\sqrt{x}
$$

The marginal bleed increase grows as $\sqrt{x}$ — sublinearly increasing marginal pain. This creates an "S-shaped" urgency curve when viewed cumulatively.

### 12.3 Combined System — Phase Diagram

A student's absence follows three distinct phases:

```
Day 0              Day T_max            Day T_max + k
│  SAFE ZONE       │  BLEED ZONE         │
│  (no penalty)    │  (accelerating)      │
│                  │                      │
│  tolerance ████  │  tokens ▓▓▓▓▒▒▒░░░  │
│  draining...     │  bleeding out...     │
└──────────────────┴──────────────────────┘
       Grace Period        Active Penalty
```

**Tolerance remaining** at any point:

$$
T_{\text{remaining}}(d) = \max\!\left(0,\; T_{\max}(s) - d_{\text{absent}}\right)
$$

**Days until bleed starts** (for API display):

$$
\text{daysUntilBleed} = T_{\text{remaining}}
$$

### 12.4 Worked Example

**Student:** Longest streak = 7, current balance = 100, absent for 15 days.

$$
T_{\max}(7) = \lfloor 2 + \ln(8) \times 3 \rfloor = \lfloor 2 + 6.24 \rfloor = 8
$$

$$
d_{\text{over}} = 15 - 8 = 7
$$

**Daily bleed on day 15:**

$$
\text{bleed}(7) = \lceil 2 \times 7^{1.5} \rceil = \lceil 2 \times 18.52 \rceil = \lceil 37.04 \rceil = 38 \text{ tokens}
$$

**Cumulative damage** (days 9–15, assuming cron ran each day):

| Day Absent | $d_{\text{over}}$ | Daily Bleed | Balance After |
|:---:|:---:|:---:|:---:|
| 9 | 1 | 2 | 98 |
| 10 | 2 | 6 | 92 |
| 11 | 3 | 11 | 81 |
| 12 | 4 | 16 | 65 |
| 13 | 5 | 23 | 42 |
| 14 | 6 | 30 | 12 |
| 15 | 7 | 12 (capped) | 0 |

The student's 100 tokens are completely drained in 7 days of active bleed. Without the streak buffer, this would have started on day 3 instead of day 9.

### 12.5 Bleed Half-Life

How many days past tolerance until half the initial balance $\tau_0$ is gone?

The cumulative bleed after $k$ days past tolerance:

$$
C(k) = \sum_{j=1}^{k} \lceil 2j^{1.5} \rceil \approx 2\sum_{j=1}^{k} j^{1.5} \approx 2 \cdot \frac{2}{5}k^{2.5} = \frac{4}{5}k^{2.5}
$$

Setting $C(k) = \tau_0 / 2 = 50$:

$$
k \approx \left(\frac{50 \times 5}{4}\right)^{1/2.5} = 62.5^{0.4} \approx 5.9 \text{ days}
$$

So a student with $\tau_0 = 100$ loses **half their tokens in ~6 days** past tolerance.

> Source: `toleranceService.js`

---

## 13. Mood Tracking

Moods are stored as a capped FIFO queue:

$$
|\text{moodHistory}| \leq 30
$$

When a new mood is added and the history exceeds 30 entries:

$$
\text{moodHistory} \leftarrow \text{moodHistory}[-30:]
$$

Valid moods: `{happy, neutral, stressed, anxious, sad, frustrated, motivated}` — 7 categorical values.

---

## 14. Supersession Logic

When a new announcement generates tasks over a date range $[d_{\min}, d_{\max})$, the system identifies old tasks to supersede.

**Supersession predicate:** A task $t$ is superseded if and only if:

$$
t.\text{course} = \text{course} \;\wedge\; t.\text{status} = \texttt{pending} \;\wedge\; t.\text{scheduledDate} \in [d_{\min}, d_{\max}) \;\wedge\; t \notin \text{newTasks}
$$

### 14.1 Protection Predicate

A task is **protected** (exempt from supersession) if there exists an active quiz attempt:

$$
\text{protected}(t) = \exists\; a \in \text{QuizAttempt} : a.\text{task} = t.\text{id} \;\wedge\; a.\text{status} = \texttt{mcq\_in\_progress}
$$

**Final supersession set:**

$$
\text{supersede} = \{t \mid \text{supersedable}(t) \;\wedge\; \neg\text{protected}(t)\}
$$

For each $t \in \text{supersede}$:

$$
t.\text{status} \leftarrow \texttt{superseded}, \quad t.\text{supersededBy} \leftarrow \text{newAnnouncement.id}
$$

---

## 15. Constants Reference Table

| Constant | Value | Location |
|:---|:---:|:---|
| `BASE_STAKES.easy` | $5$ | `aiTaskGenerator.js`, `fallbackTaskGenerator.js` |
| `BASE_STAKES.medium` | $10$ | `aiTaskGenerator.js`, `fallbackTaskGenerator.js` |
| `BASE_STAKES.hard` | $20$ | `aiTaskGenerator.js`, `fallbackTaskGenerator.js` |
| `MAX_DURATION_HOURS` | $4$ | `aiTaskGenerator.js` |
| `DECAY_INTERVAL_DAYS` | $3$ | `tokenDecay.js` |
| `DECAY_RATE` | $0.20$ | `tokenDecay.js` |
| `MIN_STAKE` | $1$ | `tokenDecay.js` |
| `BASE_TOLERANCE` | $2$ | `toleranceService.js` |
| `LN_SCALE` | $3$ | `toleranceService.js` |
| `BLEED_ALPHA` | $2$ | `toleranceService.js` |
| `BLEED_EXPONENT` | $1.5$ | `toleranceService.js` |
| `PTS.correct` | $+2$ | `quizController.js` |
| `PTS.wrong` | $-2$ | `quizController.js` |
| `PTS.unattempted` | $-1$ | `quizController.js` |
| `PASS_THRESHOLD` | $8$ | `quizController.js` |
| `TIME_LIMIT_MS` | $15{,}000$ | `quizController.js` |
| `TIME_GRACE_MS` | $2{,}000$ | `quizController.js` |
| `MCQ_COUNT` | $6$ | `quizController.js` |
| `MAX_SCORE` | $12$ | `quizController.js` |
| Initial `tokenBalance` | $100$ | `User.js` |
| Bcrypt rounds | $12$ | `User.js` |
| Mood history cap | $30$ | `User.js` |
| Pass 1 share | $40\%$ | `aiTaskGenerator.js` |
| Pass 2 share | $35\%$ | `aiTaskGenerator.js` |
| Pass 3 share | $\sim 25\%$ | `aiTaskGenerator.js` |
| Sunday max chapters | $4$ | `fallbackTaskGenerator.js` |
| CR inactivity threshold | $30$ days | `fallbackTaskGenerator.js` |
| Sunday revision max duration | $3$ h | `fallbackTaskGenerator.js` |
| Weekly chapters per week | $6$ (Mon–Sat) | `fallbackTaskGenerator.js` |

---

## 16. System of Equations — Full Token Flow

The complete lifecycle of a student's token balance $\tau$ over time:

$$
\tau(t) = \tau_0 + \sum_{\text{passed}} 2S_i - \sum_{\text{failed}} S_j - \sum_{\text{upvotes}} w_k - \sum_{\text{downvotes}} w_l + \sum_{\substack{\text{downvote}\\\text{upheld}}} 2w_m - \sum_{\substack{\text{downvote}\\\text{penalized}}} S_n - \underbrace{\sum_{\text{days}} \text{bleed}(d_{\text{over}})}_{\text{tolerance bleed}}
$$

Where:
- $\tau_0 = 100$ (initial balance)
- $S_i$ = stake of passed quiz $i$ (net gain $= +S_i$ since stake is returned plus reward)
- $S_j$ = stake of failed quiz $j$ (net loss $= -S_j$)
- $w_k$ = wager on upvote $k$ (always lost)
- $w_l$ = wager on downvote $l$ (lost at cast time)
- $2w_m$ = return when your downvote is upheld (wager back + bonus)
- $S_n$ = task stake lost when you are downvoted and agree/lose arbitration
- $\text{bleed}(d_{\text{over}})$ = daily tolerance penalty (§12), $\lceil 2d^{1.5} \rceil$ for each day past tolerance cap

**Steady-state condition** for a balanced student (not losing tokens):

$$
\mathbb{E}[\text{quiz gains}] > \mathbb{E}[\text{quiz losses}] + \mathbb{E}[\text{review costs}] + \mathbb{E}[\text{decay losses}] + \mathbb{E}[\text{tolerance bleed}]
$$

Expanding:

$$
p_{\text{pass}} \cdot \overline{S} > (1 - p_{\text{pass}}) \cdot \overline{S} + \overline{w} \cdot r_{\text{review}} + \text{decay} + \mathbb{E}[\text{bleed}]
$$

Where $p_{\text{pass}}$ is the student's pass rate, $\overline{S}$ is average stake, $\overline{w}$ is average wager, $r_{\text{review}}$ is reviews per period, and $\mathbb{E}[\text{bleed}]$ depends on login consistency. Simplifying:

$$
p_{\text{pass}} > \frac{1}{2} + \frac{\overline{w} \cdot r_{\text{review}} + \text{decay} + \mathbb{E}[\text{bleed}]}{2\overline{S}}
$$

A student must maintain a pass rate **above 50%** (plus a margin for review costs, decay, and absence penalties) to sustain their token balance. The tolerance system ensures that **consistent engagement** (which builds streak → higher tolerance cap) compounds favorably.

---

*Generated from Focus Enhancer v4.2 source code. Every formula is a direct transcription from the implementation.*
