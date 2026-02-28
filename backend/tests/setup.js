/* ── Global test setup — runs before each test file ───────────── */
import { beforeAll, afterAll, afterEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// ── Env vars set at module scope so they're available at import time ──
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-chars-long';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.NODE_ENV = 'test';
process.env.PORT = '0';

let mongod;

beforeAll(async () => {
    // ── In-memory MongoDB ────────────────────────────────────
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGO_URI = uri;

    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }
});

afterEach(async () => {
    // ── Drop all collections between tests ───────────────────
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});
