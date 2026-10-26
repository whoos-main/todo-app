// Starts a throwaway MongoDB replica set for the API tests (port fixed in vitest.config.ts)
import { mongoUri, pushSchema, startMongo } from '../scripts/mongo.mjs';

const TEST_MONGO_PORT = 27117;

export default async function setup() {
  const mongo = await startMongo({ port: TEST_MONGO_PORT });
  pushSchema(mongoUri(TEST_MONGO_PORT, 'todo-test'));
  return () => mongo.stop();
}
