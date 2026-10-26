import { db } from '@/lib/db';
import { handle, notFound, type RouteContext } from '@/lib/api';

export const GET = handle(async (_req: Request, { params }: RouteContext) => {
  const { id } = await params;
  if (!(await db.yearPlan.findUnique({ where: { id }, select: { id: true } }))) throw notFound('연간 계획');
  const [months, weeks, tasks] = await Promise.all([
    db.monthPlan.count({ where: { yearPlanId: id } }),
    db.weekPlan.count({ where: { monthPlan: { yearPlanId: id } } }),
    db.dailyTask.count({ where: { weekPlan: { monthPlan: { yearPlanId: id } } } }),
  ]);
  return Response.json({ months, weeks, tasks, total: months + weeks + tasks });
});
