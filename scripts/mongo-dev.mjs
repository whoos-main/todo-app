// `npm run db:start` — runs a local MongoDB on port 27017 with data kept in .mongo-data/.
// Leave it running while using `npm run dev`; stop with Ctrl+C.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, mongoUri, pushSchema, startMongo } from './mongo.mjs';

const PORT = 27017;
const dbPath = path.join(ROOT, '.mongo-data');
mkdirSync(dbPath, { recursive: true });

const mongo = await startMongo({ port: PORT, dbPath });
const uri = mongoUri(PORT, 'todo');
pushSchema(uri);
console.log(`MongoDB ready: ${uri}`);
console.log('Ctrl+C to stop. Data is kept in .mongo-data/');

const stop = async () => {
  await mongo.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
