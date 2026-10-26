import { db } from '@/lib/db';
import { handle, notFound, parseBody } from '@/lib/api';
import { createMonthSchema } from '@/domain/validation';

export const POST = handle(async (req: Request) => {
  const data = await parseBody(req, createMonthSchema);
  if (!(await db.yearPlan.findUnique({ where: { id: data.yearPlanId }, select: { id: true } }))) {
    throw notFound('연간 계획');
  }
  return Response.json(await db.monthPlan.create({ data }), { status: 201 });
});
