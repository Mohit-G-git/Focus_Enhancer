/* ── Unit Tests: Pure Functions (no DB needed) ─────────────── */
import { describe, it, expect } from 'vitest';
import {
    calculateUrgency,
    calculateTokenEconomics,
    getTaskCountForEvent,
    buildSchedule,
} from '../../src/services/aiTaskGenerator.js';
import {
    detectMood,
    detectCategory,
    generateTitle,
} from '../../src/services/chatbot.js';

/* ═══════════════════════════════════════════════════════════════
   URGENCY CALCULATION
   ═══════════════════════════════════════════════════════════════ */
describe('calculateUrgency()', () => {
    it('returns critical (2.0) for < 3 days', () => {
        const event = new Date(Date.now() + 1 * 864e5);
        const { multiplier, label } = calculateUrgency(event);
        expect(multiplier).toBe(2.0);
        expect(label).toBe('critical');
    });

    it('returns high (1.5) for 3-7 days', () => {
        const event = new Date(Date.now() + 5 * 864e5);
        const { multiplier, label } = calculateUrgency(event);
        expect(multiplier).toBe(1.5);
        expect(label).toBe('high');
    });

    it('returns moderate (1.25) for 7-14 days', () => {
        const event = new Date(Date.now() + 10 * 864e5);
        const { multiplier, label } = calculateUrgency(event);
        expect(multiplier).toBe(1.25);
        expect(label).toBe('moderate');
    });

    it('returns normal (1.0) for > 14 days', () => {
        const event = new Date(Date.now() + 20 * 864e5);
        const { multiplier, label } = calculateUrgency(event);
        expect(multiplier).toBe(1.0);
        expect(label).toBe('normal');
    });

    it('returns critical for past dates (0 days)', () => {
        const event = new Date(Date.now() - 864e5);
        const { multiplier } = calculateUrgency(event);
        expect(multiplier).toBe(2.0);
    });
});

/* ═══════════════════════════════════════════════════════════════
   TOKEN ECONOMICS
   ═══════════════════════════════════════════════════════════════ */
describe('calculateTokenEconomics()', () => {
    it('easy base = 5', () => {
        const { tokenStake, reward } = calculateTokenEconomics('easy', 5);
        expect(tokenStake).toBe(5);
        expect(reward).toBe(5);
    });

    it('medium base = 10', () => {
        const { tokenStake } = calculateTokenEconomics('medium', 5);
        expect(tokenStake).toBe(10);
    });

    it('hard base = 20', () => {
        const { tokenStake } = calculateTokenEconomics('hard', 5);
        expect(tokenStake).toBe(20);
    });

    it('stake always equals reward', () => {
        const { tokenStake, reward } = calculateTokenEconomics('hard', 3, 1.5);
        expect(tokenStake).toBe(reward);
    });

    it('applies credit weight factor (cw/5)', () => {
        // creditWeight=3 → factor=0.6, easy=5 → 5*0.6=3
        const { tokenStake } = calculateTokenEconomics('easy', 3, 1.0);
        expect(tokenStake).toBe(Math.round(5 * (3 / 5)));
    });

    it('applies urgency multiplier', () => {
        // easy, cw=5, urgency=2.0 → 5 * 1.0 * 2.0 = 10
        const { tokenStake } = calculateTokenEconomics('easy', 5, 2.0);
        expect(tokenStake).toBe(10);
    });

    it('combined: credit weight + urgency', () => {
        // hard=20, cw=4→factor=0.8, urgency=1.5 → 20*0.8*1.5=24
        const { tokenStake } = calculateTokenEconomics('hard', 4, 1.5);
        expect(tokenStake).toBe(24);
    });

    it('clamps credit weight to 1-10 range', () => {
        const a = calculateTokenEconomics('easy', 0); // clamped to 1 → factor=0.2
        expect(a.tokenStake).toBe(Math.round(5 * (1 / 5)));
        const b = calculateTokenEconomics('easy', 100); // clamped to 10 → factor=2.0
        expect(b.tokenStake).toBe(10);
    });
});

/* ═══════════════════════════════════════════════════════════════
   TASK COUNT PER EVENT TYPE
   ═══════════════════════════════════════════════════════════════ */
describe('getTaskCountForEvent()', () => {
    it.each([
        ['quiz', 3], ['assignment', 4], ['lab', 3],
        ['lecture', 2], ['midterm', 6], ['final', 8],
    ])('%s → %d', (type, expected) => {
        expect(getTaskCountForEvent(type)).toBe(expected);
    });

    it('unknown event → 4 (default)', () => {
        expect(getTaskCountForEvent('seminar')).toBe(4);
    });
});

/* ═══════════════════════════════════════════════════════════════
   SCHEDULE BUILDER (3-PASS)
   ═══════════════════════════════════════════════════════════════ */
describe('buildSchedule()', () => {
    it('creates correct total number of days', () => {
        const start = new Date('2026-03-01');
        const end = new Date('2026-03-16');
        const schedule = buildSchedule(['A', 'B', 'C'], start, end);
        expect(schedule).toHaveLength(15);
    });

    it('distributes 3 passes correctly (~40/35/25)', () => {
        const start = new Date('2026-03-01');
        const end = new Date('2026-03-21');
        const schedule = buildSchedule(['X', 'Y'], start, end);
        const p1 = schedule.filter((d) => d.passNumber === 1).length;
        const p2 = schedule.filter((d) => d.passNumber === 2).length;
        const p3 = schedule.filter((d) => d.passNumber === 3).length;
        expect(p1).toBeGreaterThan(0);
        expect(p2).toBeGreaterThan(0);
        expect(p3).toBeGreaterThan(0);
        expect(p1 + p2 + p3).toBe(20);
        expect(p1).toBe(Math.round(20 * 0.4)); // 8
        expect(p2).toBe(Math.round(20 * 0.35)); // 7
    });

    it('cycles topics round-robin in each pass', () => {
        const start = new Date('2026-03-01');
        const end = new Date('2026-03-07');
        const schedule = buildSchedule(['X', 'Y', 'Z'], start, end);
        // Pass 1 gets ~40% of 6 = ~2 days
        const pass1Topics = schedule.filter((d) => d.passNumber === 1).map((d) => d.topic);
        // First topic cycle: X, Y (2 days)
        expect(pass1Topics[0]).toBe('X');
        if (pass1Topics.length > 1) expect(pass1Topics[1]).toBe('Y');
    });

    it('handles single topic', () => {
        const start = new Date('2026-03-01');
        const end = new Date('2026-03-06');
        const schedule = buildSchedule(['Only'], start, end);
        expect(schedule.every((d) => d.topic === 'Only')).toBe(true);
    });

    it('handles single day', () => {
        const start = new Date('2026-03-01');
        const end = new Date('2026-03-02');
        const schedule = buildSchedule(['A', 'B'], start, end);
        expect(schedule.length).toBeGreaterThanOrEqual(1);
    });

    it('dates are sequential', () => {
        const start = new Date('2026-03-01');
        const end = new Date('2026-03-11');
        const schedule = buildSchedule(['A', 'B'], start, end);
        for (let i = 1; i < schedule.length; i++) {
            expect(schedule[i].date >= schedule[i - 1].date).toBe(true);
        }
    });

    it('each entry has required properties', () => {
        const start = new Date('2026-03-01');
        const end = new Date('2026-03-06');
        const schedule = buildSchedule(['A'], start, end);
        for (const entry of schedule) {
            expect(entry).toHaveProperty('date');
            expect(entry).toHaveProperty('topic');
            expect(entry).toHaveProperty('passNumber');
            expect(entry).toHaveProperty('dayIndex');
            expect([1, 2, 3]).toContain(entry.passNumber);
        }
    });
});

/* ═══════════════════════════════════════════════════════════════
   MOOD DETECTION
   ═══════════════════════════════════════════════════════════════ */
describe('detectMood()', () => {
    it('detects sad', () => expect(detectMood('I feel so sad and hopeless')).toBe('sad'));
    it('detects anxious', () => expect(detectMood('I have terrible anxiety about exams')).toBe('anxious'));
    it('detects stressed', () => expect(detectMood('I am so stressed and burnt out')).toBe('stressed'));
    it('detects frustrated', () => expect(detectMood('I am frustrated and stuck, nothing works')).toBe('frustrated'));
    it('detects happy', () => expect(detectMood('I am so happy I passed! amazing!')).toBe('happy'));
    it('detects motivated', () => expect(detectMood("lets go, I'm pumped and determined!")).toBe('motivated'));
    it('returns neutral for no keywords', () => expect(detectMood('Can you explain binary trees?')).toBe('neutral'));
    it('is case insensitive', () => expect(detectMood('I am SAD')).toBe('sad'));
    it('picks strongest match', () => {
        // "stressed" + "burnt out" + "exhausted" = 3 keywords for stressed
        const result = detectMood("I'm stressed and burnt out and exhausted");
        expect(result).toBe('stressed');
    });
});

/* ═══════════════════════════════════════════════════════════════
   CATEGORY DETECTION
   ═══════════════════════════════════════════════════════════════ */
describe('detectCategory()', () => {
    it('detects academic', () => expect(detectCategory('explain the formula and theorem')).toBe('academic'));
    it('detects emotional', () => expect(detectCategory('I feel depressed and overwhelmed')).toBe('emotional'));
    it('detects doubt', () => expect(detectCategory("I don't understand, where did i go wrong")).toBe('doubt'));
    it('returns general for no keywords', () => expect(detectCategory('hello there')).toBe('general'));
    it('is case insensitive', () => expect(detectCategory('EXPLAIN this CONCEPT')).toBe('academic'));
});

/* ═══════════════════════════════════════════════════════════════
   TITLE GENERATION
   ═══════════════════════════════════════════════════════════════ */
describe('generateTitle()', () => {
    it('keeps short messages as-is', () => {
        expect(generateTitle('Hello there')).toBe('Hello there');
    });

    it('truncates to first sentence if < 50 chars', () => {
        expect(generateTitle('How does BFS work? I need to understand it.')).toBe('How does BFS work');
    });

    it('truncates long messages to 50 chars with ...', () => {
        const long = 'A'.repeat(100);
        const title = generateTitle(long);
        expect(title.length).toBeLessThanOrEqual(50);
        expect(title.endsWith('...')).toBe(true);
    });

    it('returns default for empty string', () => {
        expect(generateTitle('  ')).toBe('New Conversation');
    });
});
