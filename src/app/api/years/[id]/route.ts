import { db } from '@/lib/db';
import { handle, parseBody, type RouteContext } from '@/lib/api';
import { updateYearSchema } from '@/domain/validation';

export const PATCH = handle(async (req: Request, { params }: RouteContext) => {
  const { id } = await params;
  const data = await parseBody(req, updateYearSchema);
  return Response.json(await db.yearPlan.update({ where: { id }, data }));
});

export const DELETE = handle(async (_req: Request, { params }: RouteContext) => {
  const { id } = await params;
  await db.yearPlan.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
