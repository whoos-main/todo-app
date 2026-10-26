import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';

// Reuse one client across Next dev hot reloads instead of opening a new connection each time
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Unscoped client: auth (User/Session), scripts and tests. */
export const baseDb = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = baseDb;

// The signed-in user for the current API request, set by handle() in lib/api.ts
const userScope = new AsyncLocalStorage<string>();

export const runAsUser = <T>(userId: string, fn: () => T): T => userScope.run(userId, fn);

const PLAN_MODELS = new Set(['YearPlan', 'MonthPlan', 'WeekPlan', 'DailyTask']);
const WHERE_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
]);

const WRITE_OPS = new Set(['create', 'createMany']);

type ScopedArgs = { where?: object; data?: object | object[]; create?: object };

/**
 * Plan queries made inside runAsUser() only see and write that user's rows:
 * userId is added to every filter and to created rows. Another user's id then
 * behaves like a missing one (null / P2025 → 404), so route handlers need no
 * ownership checks of their own.
 *
 * It fails closed: a plan query with no user (e.g. a route without handle(), or a
 * query awaited after runAsUser returned) or an operation it cannot scope (raw
 * queries) throws instead of running unscoped. Scripts and tests use baseDb.
 * Nested writes are not scoped either; the routes do not use them.
 */
export const db = baseDb.$extends({
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (!PLAN_MODELS.has(model)) return query(args);
        const userId = userScope.getStore();
        if (!userId) throw new Error(`${model}.${operation} outside a signed-in request: use baseDb`);
        if (!WHERE_OPS.has(operation) && !WRITE_OPS.has(operation)) {
          throw new Error(`${model}.${operation} cannot be scoped to a user`);
        }

        const a = { ...(args as ScopedArgs) };
        if (WHERE_OPS.has(operation)) a.where = { ...a.where, userId };
        if (operation === 'create') a.data = { ...a.data, userId };
        if (operation === 'createMany') a.data = ([] as object[]).concat(a.data ?? []).map((d) => ({ ...d, userId }));
        if (operation === 'upsert') a.create = { ...a.create, userId };
        return query(a as typeof args);
      },
    },
  },
});
