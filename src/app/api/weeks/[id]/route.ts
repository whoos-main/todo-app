import { db } from '@/lib/db';
import { handle, invalid, notFound, parseBody, type RouteContext } from '@/lib/api';
import { taskDateError, updateWeekSchema } from '@/domain/validation';

export const PATCH = handle(async (req: Request, { params }: RouteContext) => {
  const { id } = await params;
  const data = await parseBody(req, updateWeekSchema);

  if (data.weekStart) {
    const week = await db.weekPlan.findUnique({ where: { id }, include: { tasks: { select: { date: true } } } });
    if (!week) throw notFound('주간 계획');
    // Moving the week must not strand existing tasks outside it
    const stranded = week.tasks.find((t) => taskDateError(t.date, data.weekStart!));
    if (stranded) {
      throw invalid({ weekStart: `이 주의 할 일(${stranded.date})이 새 기간 밖에 있어요. 할 일 날짜를 먼저 옮겨 주세요` });
    }
  }

  return Response.json(await db.weekPlan.update({ where: { id }, data }));
});

export const DELETE = handle(async (_req: Request, { params }: RouteContext) => {
  const { id } = await params;
  await db.weekPlan.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
