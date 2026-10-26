// Local MongoDB for dev, tests and E2E, without installing MongoDB system-wide.
// Prisma needs a replica set (it uses transactions), so this always starts a
// single-node replica set.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Starts a single-node replica set on `port`. With `dbPath` the data is kept
 * on disk between runs; without it the data lives in a temp dir.
 */
export async function startMongo({ port, dbPath }) {
  return MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' },
    instanceOpts: [{ port, ...(dbPath ? { dbPath } : {}) }],
  });
}

export const mongoUri = (port, dbName) => `mongodb://127.0.0.1:${port}/${dbName}?replicaSet=rs0`;

/** Creates collections and indexes from prisma/schema.prisma. */
export function pushSchema(uri) {
  execSync('npx prisma db push --skip-generate', {
    cwd: ROOT,
    env: { ...process.env, MONGODB_URI: uri },
    stdio: 'pipe',
  });
}
