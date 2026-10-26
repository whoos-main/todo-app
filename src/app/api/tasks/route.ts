import { db } from '@/lib/db';
import { handle, invalid, notFound, parseBody } from '@/lib/api';
import { createTaskSchema, taskDateError } from '@/domain/validation';
import { isMonday } from '@/domain/dates';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const weekStart = new URL(req.url).searchParams.get('weekStart') ?? '';
  if (!isMonday(weekStart)) throw invalid({ weekStart: 'weekStart는 월요일(YYYY-MM-DD)이어야 해요' });

  const weekPlans = await db.weekPlan.findMany({
    where: { weekStart },
    orderBy: { createdAt: 'asc' },
    select: { id: true, monthPlanId: true, weekStart: true, title: true, status: true },
  });
  const tasks = await db.dailyTask.findMany({
    where: { weekPlanId: { in: weekPlans.map((p) => p.id) } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, weekPlanId: true, date: true, title: true, status: true, order: true },
  });
  return Response.json({ weekStart, weekPlans, tasks });
});

export const POST = handle(async (req: Request) => {
  const data = await parseBody(req, createTaskSchema);
  const week = await db.weekPlan.findUnique({ where: { id: data.weekPlanId }, select: { weekStart: true } });
  if (!week) throw notFound('주간 계획');

  const dateError = taskDateError(data.date, week.weekStart);
  if (dateError) throw invalid({ date: dateError });

  const status = data.status ?? 'todo';
  let order = data.order;
  if (order === undefined) {
    // Append to the end of its column for that day. The board shows one day across
    // all week plans, so the column is (date, status), not (weekPlanId, status)
    const last = await db.dailyTask.findFirst({
      where: { date: data.date, status },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    order = (last?.order ?? 0) + 1;
  }

  const task = await db.dailyTask.create({ data: { ...data, status, order } });
  return Response.json(task, { status: 201 });
});
