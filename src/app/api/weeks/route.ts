import { db } from '@/lib/db';
import { handle, notFound, parseBody } from '@/lib/api';
import { createWeekSchema } from '@/domain/validation';

export const POST = handle(async (req: Request) => {
  const data = await parseBody(req, createWeekSchema);
  if (!(await db.monthPlan.findUnique({ where: { id: data.monthPlanId }, select: { id: true } }))) {
    throw notFound('월간 계획');
  }
  return Response.json(await db.weekPlan.create({ data }), { status: 201 });
});
