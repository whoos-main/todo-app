import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Starting MongoDB the first time downloads its binary
    hookTimeout: 300_000,
    // API tests share one database, so run files one at a time
    fileParallelism: false,
    env: { MONGODB_URI: 'mongodb://127.0.0.1:27117/todo-test?replicaSet=rs0' },
  },
});
