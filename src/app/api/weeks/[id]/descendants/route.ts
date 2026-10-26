import { db } from '@/lib/db';
import { handle, notFound, type RouteContext } from '@/lib/api';

export const GET = handle(async (_req: Request, { params }: RouteContext) => {
  const { id } = await params;
  if (!(await db.weekPlan.findUnique({ where: { id }, select: { id: true } }))) throw notFound('주간 계획');
  const tasks = await db.dailyTask.count({ where: { weekPlanId: id } });
  return Response.json({ months: 0, weeks: 0, tasks, total: tasks });
});
