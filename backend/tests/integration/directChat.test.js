/* ── Integration Tests: Direct Chat & User Search ───────────── */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp, generateToken } from '../helpers.js';
import User from '../../src/models/User.js';
import DirectConversation from '../../src/models/DirectConversation.js';

const app = createApp();

/* ── Helpers ────────────────────────────────────────────────── */
async function seedUser(overrides = {}) {
    const base = {
        name: `User_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        email: `u${Date.now()}${Math.random().toString(36).slice(2, 6)}@test.edu`,
        passwordHash: 'password123',
        tokenBalance: 100,
    };
    const user = await User.create({ ...base, ...overrides });
    const token = generateToken(user._id, user.role || 'student');
    return { user, token };
}

describe('Direct Chat System', () => {
    /* ═══════════════════════════════════════════════════════════
       USER SEARCH — GET /api/users/search?q=
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/users/search', () => {
        it('returns 401 without auth', async () => {
            const res = await request(app).get('/api/users/search?q=test');
            expect(res.status).toBe(401);
        });

        it('returns 400 when query is too short', async () => {
            const { token } = await seedUser();
            const res = await request(app)
                .get('/api/users/search?q=a')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(400);
        });

        it('finds users by name', async () => {
            const { token } = await seedUser({ name: 'Searcher' });
            const { user: target } = await seedUser({ name: 'TargetAlpha' });

            const res = await request(app)
                .get('/api/users/search?q=TargetAlpha')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.users.length).toBeGreaterThanOrEqual(1);
            expect(res.body.users.some((u) => u._id === target._id.toString())).toBe(true);
        });

        it('finds users by email', async () => {
            const uniqueEmail = `findme_${Date.now()}@special.edu`;
            await seedUser({ email: uniqueEmail });
            const { token } = await seedUser();

            const res = await request(app)
                .get(`/api/users/search?q=findme_`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.users.some((u) => u.email === uniqueEmail)).toBe(true);
        });

        it('excludes the requesting user from results', async () => {
            const { user, token } = await seedUser({ name: 'SelfExclude' });

            const res = await request(app)
                .get('/api/users/search?q=SelfExclude')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.users.every((u) => u._id !== user._id.toString())).toBe(true);
        });

        it('returns max 20 results', async () => {
            const { token } = await seedUser();
            // Create 25 users with same prefix
            const prefix = `Bulk${Date.now()}`;
            await Promise.all(
                Array.from({ length: 25 }, (_, i) =>
                    User.create({
                        name: `${prefix}_${i}`,
                        email: `${prefix.toLowerCase()}_${i}@test.edu`,
                        passwordHash: 'password123',
                    }),
                ),
            );

            const res = await request(app)
                .get(`/api/users/search?q=${prefix}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.users.length).toBeLessThanOrEqual(20);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       SEND REQUEST — POST /api/direct-chat/request
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/direct-chat/request', () => {
        it('sends a chat request successfully', async () => {
            const { token: senderToken } = await seedUser();
            const { user: target } = await seedUser();

            const res = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.conversation.status).toBe('requested');
        });

        it('returns 400 when sending request to self', async () => {
            const { user, token } = await seedUser();

            const res = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${token}`)
                .send({ targetUserId: user._id.toString() });

            expect(res.status).toBe(400);
        });

        it('returns 404 for non-existent target user', async () => {
            const { token } = await seedUser();

            const res = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${token}`)
                .send({ targetUserId: new mongoose.Types.ObjectId().toString() });

            expect(res.status).toBe(404);
        });

        it('returns 409 when duplicate pending request exists', async () => {
            const { user: sender, token: senderToken } = await seedUser();
            const { user: target } = await seedUser();

            // First request
            await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            // Duplicate
            const res = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            expect(res.status).toBe(409);
        });

        it('returns 409 when active conversation already exists', async () => {
            const { user: sender, token: senderToken } = await seedUser();
            const { user: target, token: targetToken } = await seedUser();

            // Create and accept
            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${targetToken}`);

            // Try sending another request
            const res = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            expect(res.status).toBe(409);
        });

        it('allows new request after previous conversation ended', async () => {
            const { user: sender, token: senderToken } = await seedUser();
            const { user: target, token: targetToken } = await seedUser();

            // Create, accept, then end
            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${targetToken}`);

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/end`)
                .set('Authorization', `Bearer ${senderToken}`);

            // New request should work
            const res = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            expect(res.status).toBe(201);
        });

        it('returns 400 for invalid targetUserId', async () => {
            const { token } = await seedUser();

            const res = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${token}`)
                .send({ targetUserId: 'not-a-mongo-id' });

            expect(res.status).toBe(400);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET REQUESTS — incoming / outgoing
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/direct-chat/requests', () => {
        it('returns incoming requests for the target', async () => {
            const { user: sender, token: senderToken } = await seedUser();
            const { user: target, token: targetToken } = await seedUser();

            await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            const res = await request(app)
                .get('/api/direct-chat/requests/incoming')
                .set('Authorization', `Bearer ${targetToken}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBeGreaterThanOrEqual(1);
            expect(res.body.requests[0].initiator).toHaveProperty('name');
        });

        it('returns outgoing requests for the sender', async () => {
            const { user: sender, token: senderToken } = await seedUser();
            const { user: target } = await seedUser();

            await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            const res = await request(app)
                .get('/api/direct-chat/requests/outgoing')
                .set('Authorization', `Bearer ${senderToken}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBeGreaterThanOrEqual(1);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       ACCEPT — PUT /api/direct-chat/:id/accept
       ═══════════════════════════════════════════════════════════ */
    describe('PUT /api/direct-chat/:id/accept', () => {
        it('accepts a pending request', async () => {
            const { token: senderToken } = await seedUser();
            const { user: target, token: targetToken } = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${targetToken}`);

            expect(res.status).toBe(200);
            expect(res.body.conversation.status).toBe('active');
            expect(res.body.conversation.acceptedAt).toBeTruthy();
        });

        it('returns 403 when initiator tries to accept own request', async () => {
            const { user: sender, token: senderToken } = await seedUser();
            const { user: target } = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${senderToken}`);

            expect(res.status).toBe(403);
        });

        it('returns 400 when accepting an already active conversation', async () => {
            const { token: senderToken } = await seedUser();
            const { user: target, token: targetToken } = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${targetToken}`);

            // Try again
            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${targetToken}`);

            expect(res.status).toBe(400);
        });

        it('returns 403 for non-participant', async () => {
            const { token: senderToken } = await seedUser();
            const { user: target } = await seedUser();
            const { token: outsiderToken } = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${outsiderToken}`);

            expect(res.status).toBe(403);
        });

        it('returns 404 for non-existent conversation', async () => {
            const { token } = await seedUser();

            const res = await request(app)
                .put(`/api/direct-chat/${new mongoose.Types.ObjectId()}/accept`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       REJECT — PUT /api/direct-chat/:id/reject
       ═══════════════════════════════════════════════════════════ */
    describe('PUT /api/direct-chat/:id/reject', () => {
        it('rejects and deletes the request', async () => {
            const { token: senderToken } = await seedUser();
            const { user: target, token: targetToken } = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/reject`)
                .set('Authorization', `Bearer ${targetToken}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/rejected/i);

            // Verify deleted from DB
            const found = await DirectConversation.findById(r1.body.conversation._id);
            expect(found).toBeNull();
        });

        it('returns 403 when initiator tries to reject own request', async () => {
            const { user: sender, token: senderToken } = await seedUser();
            const { user: target } = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target._id.toString() });

            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/reject`)
                .set('Authorization', `Bearer ${senderToken}`);

            expect(res.status).toBe(403);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       SEND MESSAGE — POST /api/direct-chat/:id/message
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/direct-chat/:id/message', () => {
        let senderToken, targetToken, convoId;

        beforeEach(async () => {
            const sender = await seedUser();
            const target = await seedUser();
            senderToken = sender.token;
            targetToken = target.token;

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ targetUserId: target.user._id.toString() });

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${targetToken}`);

            convoId = r1.body.conversation._id;
        });

        it('sends a message in an active conversation', async () => {
            const res = await request(app)
                .post(`/api/direct-chat/${convoId}/message`)
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ content: 'Hello there!' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message.content).toBe('Hello there!');
        });

        it('both participants can send messages', async () => {
            await request(app)
                .post(`/api/direct-chat/${convoId}/message`)
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ content: 'Hey!' });

            const res = await request(app)
                .post(`/api/direct-chat/${convoId}/message`)
                .set('Authorization', `Bearer ${targetToken}`)
                .send({ content: 'Hey back!' });

            expect(res.status).toBe(201);
            expect(res.body.message.content).toBe('Hey back!');
        });

        it('returns 400 when sending message to a non-active (requested) conversation', async () => {
            const s2 = await seedUser();
            const t2 = await seedUser();

            const r = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${s2.token}`)
                .send({ targetUserId: t2.user._id.toString() });

            const res = await request(app)
                .post(`/api/direct-chat/${r.body.conversation._id}/message`)
                .set('Authorization', `Bearer ${s2.token}`)
                .send({ content: 'Cannot send this' });

            expect(res.status).toBe(400);
        });

        it('returns 400 when sending message to an ended conversation', async () => {
            await request(app)
                .put(`/api/direct-chat/${convoId}/end`)
                .set('Authorization', `Bearer ${senderToken}`);

            const res = await request(app)
                .post(`/api/direct-chat/${convoId}/message`)
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ content: 'Too late' });

            expect(res.status).toBe(400);
        });

        it('returns 403 for non-participant', async () => {
            const { token: outsiderToken } = await seedUser();

            const res = await request(app)
                .post(`/api/direct-chat/${convoId}/message`)
                .set('Authorization', `Bearer ${outsiderToken}`)
                .send({ content: 'Intruder!' });

            expect(res.status).toBe(403);
        });

        it('returns 400 for empty content', async () => {
            const res = await request(app)
                .post(`/api/direct-chat/${convoId}/message`)
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ content: '' });

            expect(res.status).toBe(400);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET CONVERSATION — GET /api/direct-chat/:id
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/direct-chat/:id', () => {
        it('returns the conversation with messages and populated participants', async () => {
            const sender = await seedUser();
            const target = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: target.user._id.toString() });

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${target.token}`);

            await request(app)
                .post(`/api/direct-chat/${r1.body.conversation._id}/message`)
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ content: 'Msg 1' });

            const res = await request(app)
                .get(`/api/direct-chat/${r1.body.conversation._id}`)
                .set('Authorization', `Bearer ${sender.token}`);

            expect(res.status).toBe(200);
            expect(res.body.conversation.messages).toHaveLength(1);
            expect(res.body.conversation.participants).toHaveLength(2);
            expect(res.body.conversation.participants[0]).toHaveProperty('name');
        });

        it('returns 403 for non-participant', async () => {
            const sender = await seedUser();
            const target = await seedUser();
            const outsider = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: target.user._id.toString() });

            const res = await request(app)
                .get(`/api/direct-chat/${r1.body.conversation._id}`)
                .set('Authorization', `Bearer ${outsider.token}`);

            expect(res.status).toBe(403);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       LIST CONVERSATIONS — GET /api/direct-chat
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/direct-chat', () => {
        it('lists all conversations for the user', async () => {
            const sender = await seedUser();
            const t1 = await seedUser();
            const t2 = await seedUser();

            await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: t1.user._id.toString() });

            await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: t2.user._id.toString() });

            const res = await request(app)
                .get('/api/direct-chat')
                .set('Authorization', `Bearer ${sender.token}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBeGreaterThanOrEqual(2);
            // Messages should be excluded from listing
            res.body.conversations.forEach((c) => {
                expect(c.messages).toBeUndefined();
            });
        });

        it('filters by status query param', async () => {
            const sender = await seedUser();
            const t1 = await seedUser();
            const t2 = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: t1.user._id.toString() });

            // Accept one
            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${t1.token}`);

            // Second stays pending
            await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: t2.user._id.toString() });

            const activeRes = await request(app)
                .get('/api/direct-chat?status=active')
                .set('Authorization', `Bearer ${sender.token}`);

            const pendingRes = await request(app)
                .get('/api/direct-chat?status=requested')
                .set('Authorization', `Bearer ${sender.token}`);

            expect(activeRes.body.conversations.every((c) => c.status === 'active')).toBe(true);
            expect(pendingRes.body.conversations.every((c) => c.status === 'requested')).toBe(true);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       END CONVERSATION — PUT /api/direct-chat/:id/end
       ═══════════════════════════════════════════════════════════ */
    describe('PUT /api/direct-chat/:id/end', () => {
        it('ends an active conversation', async () => {
            const sender = await seedUser();
            const target = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: target.user._id.toString() });

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${target.token}`);

            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/end`)
                .set('Authorization', `Bearer ${sender.token}`);

            expect(res.status).toBe(200);
            expect(res.body.conversation.status).toBe('ended');
            expect(res.body.conversation.endedAt).toBeTruthy();
            expect(res.body.conversation.endedBy).toBeTruthy();
        });

        it('either participant can end the conversation', async () => {
            const sender = await seedUser();
            const target = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: target.user._id.toString() });

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${target.token}`);

            // Target ends it (not the initiator)
            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/end`)
                .set('Authorization', `Bearer ${target.token}`);

            expect(res.status).toBe(200);
            expect(res.body.conversation.status).toBe('ended');
        });

        it('returns 400 when ending an already ended conversation', async () => {
            const sender = await seedUser();
            const target = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: target.user._id.toString() });

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/accept`)
                .set('Authorization', `Bearer ${target.token}`);

            await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/end`)
                .set('Authorization', `Bearer ${sender.token}`);

            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/end`)
                .set('Authorization', `Bearer ${sender.token}`);

            expect(res.status).toBe(400);
        });

        it('allows cancelling a pending request via end', async () => {
            const sender = await seedUser();
            const target = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: target.user._id.toString() });

            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/end`)
                .set('Authorization', `Bearer ${sender.token}`);

            expect(res.status).toBe(200);
            expect(res.body.conversation.status).toBe('ended');
        });

        it('returns 403 for non-participant', async () => {
            const sender = await seedUser();
            const target = await seedUser();
            const outsider = await seedUser();

            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${sender.token}`)
                .send({ targetUserId: target.user._id.toString() });

            const res = await request(app)
                .put(`/api/direct-chat/${r1.body.conversation._id}/end`)
                .set('Authorization', `Bearer ${outsider.token}`);

            expect(res.status).toBe(403);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       FULL FLOW — End-to-end chat lifecycle
       ═══════════════════════════════════════════════════════════ */
    describe('Full Chat Lifecycle', () => {
        it('request → accept → exchange messages → end → new request', async () => {
            const alice = await seedUser({ name: 'Alice' });
            const bob = await seedUser({ name: 'Bob' });

            // 1. Alice sends request to Bob
            const r1 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${alice.token}`)
                .send({ targetUserId: bob.user._id.toString() });
            expect(r1.status).toBe(201);
            const convoId = r1.body.conversation._id;

            // 2. Bob sees incoming request
            const incoming = await request(app)
                .get('/api/direct-chat/requests/incoming')
                .set('Authorization', `Bearer ${bob.token}`);
            expect(incoming.body.count).toBeGreaterThanOrEqual(1);

            // 3. Bob accepts
            const acc = await request(app)
                .put(`/api/direct-chat/${convoId}/accept`)
                .set('Authorization', `Bearer ${bob.token}`);
            expect(acc.body.conversation.status).toBe('active');

            // 4. Alice sends message
            const m1 = await request(app)
                .post(`/api/direct-chat/${convoId}/message`)
                .set('Authorization', `Bearer ${alice.token}`)
                .send({ content: 'Hi Bob!' });
            expect(m1.status).toBe(201);

            // 5. Bob replies
            const m2 = await request(app)
                .post(`/api/direct-chat/${convoId}/message`)
                .set('Authorization', `Bearer ${bob.token}`)
                .send({ content: 'Hi Alice!' });
            expect(m2.status).toBe(201);

            // 6. Get conversation — should have 2 messages
            const convo = await request(app)
                .get(`/api/direct-chat/${convoId}`)
                .set('Authorization', `Bearer ${alice.token}`);
            expect(convo.body.conversation.messages).toHaveLength(2);

            // 7. Bob ends the conversation
            const end = await request(app)
                .put(`/api/direct-chat/${convoId}/end`)
                .set('Authorization', `Bearer ${bob.token}`);
            expect(end.body.conversation.status).toBe('ended');

            // 8. Can't send messages to ended conversation
            const fail = await request(app)
                .post(`/api/direct-chat/${convoId}/message`)
                .set('Authorization', `Bearer ${alice.token}`)
                .send({ content: 'Are you there?' });
            expect(fail.status).toBe(400);

            // 9. Alice can start a NEW conversation with Bob
            const r2 = await request(app)
                .post('/api/direct-chat/request')
                .set('Authorization', `Bearer ${alice.token}`)
                .send({ targetUserId: bob.user._id.toString() });
            expect(r2.status).toBe(201);
        });
    });
});
