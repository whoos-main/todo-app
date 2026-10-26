import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { fieldErrors } from '@/domain/validation';
import { currentUser, isCrossOrigin } from './auth';
import { runAsUser } from './db';

export type RouteContext = { params: Promise<{ id: string }> };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, 'not_found', `${what}을(를) 찾을 수 없어요`);

export const invalid = (fields: Record<string, string>) =>
  new ApiError(400, 'validation_error', '입력값을 확인해 주세요', fields);

export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', '요청 본문이 올바른 JSON이 아니에요');
  }
  const result = schema.safeParse(body);
  if (!result.success) throw invalid(fieldErrors(result.error));
  return result.data;
}

/**
 * Wraps a handler so it runs only for a signed-in user (401 otherwise, 403 for a
 * cross-origin write), with every
 * plan query scoped to that user, and thrown ApiErrors and Prisma "record not found"
 * become JSON error responses.
 */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      const [req] = args;
      if (req instanceof Request && !['GET', 'HEAD'].includes(req.method) && isCrossOrigin(req)) {
        throw new ApiError(403, 'forbidden', '다른 사이트에서 보낸 요청은 처리할 수 없어요');
      }
      const user = await currentUser();
      if (!user) throw new ApiError(401, 'unauthorized', '로그인이 필요해요');
      return await runAsUser(user.id, () => fn(...args));
    } catch (e) {
      if (e instanceof ApiError) {
        return Response.json(
          { error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) } },
          { status: e.status },
        );
      }
      // P2023 with a malformed ObjectID: an id that cannot exist in MongoDB
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === 'P2025' || (e.code === 'P2023' && /ObjectI[dD]/.test(e.message)))
      ) {
        return Response.json({ error: { code: 'not_found', message: '항목을 찾을 수 없어요' } }, { status: 404 });
      }
      console.error(e);
      return Response.json({ error: { code: 'internal_error', message: '서버 오류가 발생했어요' } }, { status: 500 });
    }
  };
}
