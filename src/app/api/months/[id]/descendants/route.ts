import { db } from '@/lib/db';
import { handle, notFound, type RouteContext } from '@/lib/api';

export const GET = handle(async (_req: Request, { params }: RouteContext) => {
  const { id } = await params;
  if (!(await db.monthPlan.findUnique({ where: { id }, select: { id: true } }))) throw notFound('월간 계획');
  const [weeks, tasks] = await Promise.all([
    db.weekPlan.count({ where: { monthPlanId: id } }),
    db.dailyTask.count({ where: { weekPlan: { monthPlanId: id } } }),
  ]);
  return Response.json({ months: 0, weeks, tasks, total: weeks + tasks });
});
