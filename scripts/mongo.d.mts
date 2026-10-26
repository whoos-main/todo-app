import type { MongoMemoryReplSet } from 'mongodb-memory-server-core';

export declare const ROOT: string;
export declare function startMongo(opts: { port: number; dbPath?: string }): Promise<MongoMemoryReplSet>;
export declare function mongoUri(port: number, dbName: string): string;
export declare function pushSchema(uri: string): void;
