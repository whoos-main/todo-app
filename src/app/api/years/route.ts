import { db } from '@/lib/db';
import { handle, parseBody } from '@/lib/api';
import { createYearSchema } from '@/domain/validation';

export const POST = handle(async (req: Request) => {
  const data = await parseBody(req, createYearSchema);
  const year = await db.yearPlan.create({ data });
  return Response.json(year, { status: 201 });
});
