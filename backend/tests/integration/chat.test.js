/* ── Integration Tests: Chat Routes ─────────────────────────── */
import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

/* ── Mock Gemini shared client (chatCompletion) ─────────────── */
vi.mock('../../src/services/geminiClient.js', () => ({
    generateContent: vi.fn().mockResolvedValue('mock content'),
    chatCompletion: vi.fn().mockResolvedValue('Mock bot response: I\'m here to help!'),
    parseJSON: vi.fn((raw) => JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim())),
    _resetThrottle: vi.fn(),
}));

import { createApp, generateToken } from '../helpers.js';
import User from '../../src/models/User.js';
import Conversation from '../../src/models/Conversation.js';

const app = createApp();
const oid = () => new mongoose.Types.ObjectId();

/* ── Seed: student user with token ──────────────────────────── */
async function seedChatUser() {
    const user = await User.create({
        name: 'Chat Student', email: `chat${Date.now()}@test.edu`,
        passwordHash: 'password123', tokenBalance: 100,
    });
    const token = generateToken(user._id, 'student');
    return { user, token };
}

describe('Chat Routes', () => {
    /* ═══════════════════════════════════════════════════════════
       POST /api/chat/message
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/chat/message', () => {
        it('sends a message and gets a response (new conversation)', async () => {
            const { user } = await seedChatUser();
            const res = await request(app)
                .post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'Hello, help me study' });

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveProperty('response');
            expect(res.body.data).toHaveProperty('conversationId');
            expect(res.body.data).toHaveProperty('title');
            expect(res.body.data).toHaveProperty('mood');
            expect(res.body.data).toHaveProperty('category');
        });

        it('creates a Conversation document', async () => {
            const { user } = await seedChatUser();
            const res = await request(app)
                .post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'Explain binary trees' });

            const conv = await Conversation.findById(res.body.data.conversationId);
            expect(conv).not.toBeNull();
            expect(conv.messages).toHaveLength(2); // user + assistant
            expect(conv.messages[0].role).toBe('user');
            expect(conv.messages[1].role).toBe('assistant');
        });

        it('continues existing conversation', async () => {
            const { user } = await seedChatUser();

            // First message creates conversation
            const res1 = await request(app)
                .post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'Hi' });

            // Second message continues it
            const res2 = await request(app)
                .post('/api/chat/message')
                .send({
                    userId: user._id.toString(),
                    message: 'Tell me more',
                    conversationId: res1.body.data.conversationId,
                });

            expect(res2.status).toBe(200);
            expect(res2.body.data.conversationId).toBe(res1.body.data.conversationId);

            const conv = await Conversation.findById(res1.body.data.conversationId);
            expect(conv.messages).toHaveLength(4); // 2 user + 2 assistant
        });

        it('detects mood from message', async () => {
            const { user } = await seedChatUser();
            const res = await request(app)
                .post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'I feel so stressed and anxious about exams' });

            // mood should be stress-related
            expect(['stressed', 'anxious']).toContain(res.body.data.mood);
        });

        it('detects academic category', async () => {
            const { user } = await seedChatUser();
            const res = await request(app)
                .post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'Can you explain the algorithm for binary search?' });

            expect(res.body.data.category).toBe('academic');
        });

        it('saves mood to user wellbeing history', async () => {
            const { user } = await seedChatUser();
            await request(app)
                .post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'I feel sad and lonely today' });

            const updated = await User.findById(user._id);
            expect(updated.wellbeing.moodHistory.length).toBeGreaterThanOrEqual(1);
            expect(updated.wellbeing.lastChatAt).toBeTruthy();
        });

        it('requires userId', async () => {
            const res = await request(app)
                .post('/api/chat/message')
                .send({ message: 'Hello' });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/userId required/i);
        });

        it('requires message', async () => {
            const { user } = await seedChatUser();
            const res = await request(app)
                .post('/api/chat/message')
                .send({ userId: user._id.toString(), message: '' });

            expect(res.status).toBe(400);
        });

        it('returns 404 for non-existent user', async () => {
            const res = await request(app)
                .post('/api/chat/message')
                .send({ userId: oid().toString(), message: 'Hello' });

            expect(res.status).toBe(404);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/chat/conversations
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/chat/conversations', () => {
        it('lists conversations for a user', async () => {
            const { user } = await seedChatUser();

            // Create 2 conversations
            await request(app).post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'First chat' });
            await request(app).post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'Second chat' });

            const res = await request(app)
                .get(`/api/chat/conversations?userId=${user._id}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(2);
            expect(res.body.data[0]).toHaveProperty('title');
            expect(res.body.data[0]).toHaveProperty('messageCount');
            expect(res.body.data[0]).toHaveProperty('lastMessage');
        });

        it('returns empty array for user with no conversations', async () => {
            const { user } = await seedChatUser();
            const res = await request(app)
                .get(`/api/chat/conversations?userId=${user._id}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(0);
        });

        it('requires userId', async () => {
            const res = await request(app).get('/api/chat/conversations');
            expect(res.status).toBe(400);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/chat/conversations/:conversationId
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/chat/conversations/:id', () => {
        it('returns full conversation history', async () => {
            const { user } = await seedChatUser();
            const msg = await request(app).post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'Hello buddy' });

            const res = await request(app)
                .get(`/api/chat/conversations/${msg.body.data.conversationId}?userId=${user._id}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveProperty('messages');
            expect(res.body.data.messages.length).toBeGreaterThanOrEqual(2);
            expect(res.body.data.messages[0]).toHaveProperty('role');
            expect(res.body.data.messages[0]).toHaveProperty('content');
        });

        it('returns 404 for non-existent conversation', async () => {
            const { user } = await seedChatUser();
            const res = await request(app)
                .get(`/api/chat/conversations/${oid()}?userId=${user._id}`);
            expect(res.status).toBe(404);
        });

        it('requires userId', async () => {
            const res = await request(app).get(`/api/chat/conversations/${oid()}`);
            expect(res.status).toBe(400);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       DELETE /api/chat/conversations/:conversationId
       ═══════════════════════════════════════════════════════════ */
    describe('DELETE /api/chat/conversations/:id', () => {
        it('soft-deletes a conversation', async () => {
            const { user } = await seedChatUser();
            const msg = await request(app).post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'Delete me' });

            const res = await request(app)
                .delete(`/api/chat/conversations/${msg.body.data.conversationId}`)
                .send({ userId: user._id.toString() });

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/deleted/i);

            // isActive should be false
            const conv = await Conversation.findById(msg.body.data.conversationId);
            expect(conv.isActive).toBe(false);
        });

        it('returns 404 for non-existent conversation', async () => {
            const { user } = await seedChatUser();
            const res = await request(app)
                .delete(`/api/chat/conversations/${oid()}`)
                .send({ userId: user._id.toString() });
            expect(res.status).toBe(404);
        });

        it('deleted conversation does not appear in list', async () => {
            const { user } = await seedChatUser();
            const msg = await request(app).post('/api/chat/message')
                .send({ userId: user._id.toString(), message: 'Vanish' });

            await request(app)
                .delete(`/api/chat/conversations/${msg.body.data.conversationId}`)
                .send({ userId: user._id.toString() });

            const res = await request(app)
                .get(`/api/chat/conversations?userId=${user._id}`);
            expect(res.body.count).toBe(0);
        });
    });
});
