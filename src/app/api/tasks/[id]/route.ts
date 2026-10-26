import { db } from '@/lib/db';
import { handle, invalid, notFound, parseBody, type RouteContext } from '@/lib/api';
import { taskDateError, updateTaskSchema } from '@/domain/validation';

export const PATCH = handle(async (req: Request, { params }: RouteContext) => {
  const { id } = await params;
  const data = await parseBody(req, updateTaskSchema);

  if (data.date) {
    const task = await db.dailyTask.findUnique({ where: { id }, include: { weekPlan: { select: { weekStart: true } } } });
    if (!task) throw notFound('할 일');
    const dateError = taskDateError(data.date, task.weekPlan.weekStart);
    if (dateError) throw invalid({ date: dateError });
  }

  return Response.json(await db.dailyTask.update({ where: { id }, data }));
});

export const DELETE = handle(async (_req: Request, { params }: RouteContext) => {
  const { id } = await params;
  await db.dailyTask.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
