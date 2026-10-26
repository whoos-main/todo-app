// Playwright webServer: a throwaway MongoDB plus `next dev` pointed at it
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ROOT, mongoUri, pushSchema, startMongo } from '../scripts/mongo.mjs';

const [, , port] = process.argv;
const MONGO_PORT = 27118;

const mongo = await startMongo({ port: MONGO_PORT });
const uri = mongoUri(MONGO_PORT, 'todo-e2e');
pushSchema(uri);

// Sign-in without GitHub: the test user and its sessions (tokens come from playwright.config.ts)
const prisma = new PrismaClient({ datasourceUrl: uri });
const user = await prisma.user.create({
  data: { githubId: 1, username: process.env.E2E_USERNAME, avatarUrl: process.env.E2E_AVATAR_URL },
});
for (const token of process.env.E2E_SESSION_TOKENS.split(',')) {
  await prisma.session.create({
    data: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}
await prisma.$disconnect();

const next = spawn(`npx next dev -p ${port}`, {
  cwd: ROOT,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, MONGODB_URI: uri },
});

const stop = async (code = 0) => {
  next.kill();
  await mongo.stop();
  process.exit(code);
};
next.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
