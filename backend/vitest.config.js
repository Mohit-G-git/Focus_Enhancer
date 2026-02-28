import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        setupFiles: ['./tests/setup.js'],
        testTimeout: 30_000,
        hookTimeout: 30_000,
        pool: 'forks',
        poolOptions: {
            forks: { singleFork: true },
        },
        fileParallelism: false,
        sequence: { concurrent: false },
    },
});
