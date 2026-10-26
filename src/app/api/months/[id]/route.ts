import { db } from '@/lib/db';
import { handle, parseBody, type RouteContext } from '@/lib/api';
import { updateMonthSchema } from '@/domain/validation';

export const PATCH = handle(async (req: Request, { params }: RouteContext) => {
  const { id } = await params;
  const data = await parseBody(req, updateMonthSchema);
  return Response.json(await db.monthPlan.update({ where: { id }, data }));
});

export const DELETE = handle(async (_req: Request, { params }: RouteContext) => {
  const { id } = await params;
  await db.monthPlan.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
