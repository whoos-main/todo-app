import { db } from '@/lib/db';
import { handle } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const years = await db.yearPlan.findMany({
    orderBy: [{ year: 'asc' }, { createdAt: 'asc' }],
    include: {
      months: {
        orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
        include: {
          weeks: {
            orderBy: [{ weekStart: 'asc' }, { createdAt: 'asc' }],
            include: { _count: { select: { tasks: true } } },
          },
        },
      },
    },
  });

  return Response.json(
    years.map(({ userId: _userId, createdAt: _c, months, ...year }) => ({
      ...year,
      months: months.map(({ createdAt: _mc, weeks, ...month }) => ({
        ...month,
        weeks: weeks.map(({ createdAt: _wc, _count, ...week }) => ({ ...week, taskCount: _count.tasks })),
      })),
    })),
  );
});
