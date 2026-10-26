import { beforeEach, describe, expect, it } from 'vitest';
import { baseDb, db, runAsUser } from '@/lib/db';
import { loginAs, resetUsers } from '../../../test/auth';
import * as tree from './tree/route';
import * as years from './years/route';
import * as yearById from './years/[id]/route';
import * as yearDescendants from './years/[id]/descendants/route';
import * as months from './months/route';
import * as monthById from './months/[id]/route';
import * as monthDescendants from './months/[id]/descendants/route';
import * as weeks from './weeks/route';
import * as weekById from './weeks/[id]/route';
import * as weekDescendants from './weeks/[id]/descendants/route';
import * as tasks from './tasks/route';
import * as taskById from './tasks/[id]/route';

const WEEK = '2026-10-26';

const json = (method: string, body?: unknown) =>
  new Request('http://test', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function createChain() {
  const year = await (await years.POST(json('POST', { year: 2026, title: '연간' }))).json();
  const month = await (await months.POST(json('POST', { yearPlanId: year.id, month: 10, title: '10월' }))).json();
  const week = await (await weeks.POST(json('POST', { monthPlanId: month.id, weekStart: WEEK, title: '주간' }))).json();
  return { year, month, week };
}

async function counts() {
  return Promise.all([baseDb.yearPlan.count(), baseDb.monthPlan.count(), baseDb.weekPlan.count(), baseDb.dailyTask.count()]);
}

let userId: string;

beforeEach(async () => {
  await baseDb.yearPlan.deleteMany();
  await resetUsers();
  userId = (await loginAs('tester')).id;
});

describe('AC1: hierarchical creation', () => {
  it('creates year → month → week → task and returns them in the tree', async () => {
    const { week } = await createChain();
    const res = await tasks.POST(json('POST', { weekPlanId: week.id, date: WEEK, title: '할 일' }));
    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task).toMatchObject({ status: 'todo', order: 1 });

    const data = await (await tree.GET()).json();
    expect(data).toHaveLength(1);
    expect(data[0].months[0].weeks[0]).toMatchObject({ weekStart: WEEK, taskCount: 1 });
  });

  it('400 with a field error when the parent id is missing', async () => {
    const res = await months.POST(json('POST', { month: 10, title: '10월' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.fields.yearPlanId).toBeTruthy();
  });

  it('404 when the parent does not exist', async () => {
    for (const [handler, body] of [
      [months.POST, { yearPlanId: 'nope', month: 1, title: 'a' }],
      [weeks.POST, { monthPlanId: 'nope', weekStart: WEEK, title: 'a' }],
      [tasks.POST, { weekPlanId: 'nope', date: WEEK, title: 'a' }],
    ] as const) {
      const res = await handler(json('POST', body));
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('not_found');
    }
  });

  it('400 on invalid JSON and on a non-Monday weekStart', async () => {
    const bad = new Request('http://test', { method: 'POST', body: '{' });
    expect((await years.POST(bad)).status).toBe(400);

    const { month } = await createChain();
    const res = await weeks.POST(json('POST', { monthPlanId: month.id, weekStart: '2026-10-27', title: 'a' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields.weekStart).toContain('월요일');
  });
});

describe('AC2: cascade delete', () => {
  it('year with 2 months, 3 weeks, 5 tasks → descendants 10, all rows gone after delete', async () => {
    // Rows written straight to the DB belong to the signed-in tester, like API-created ones
    const { year, m1, w3 } = await runAsUser(userId, async () => {
      const year = await db.yearPlan.create({ data: { year: 2026, title: 'y' } });
      const m1 = await db.monthPlan.create({ data: { yearPlanId: year.id, month: 10, title: 'm1' } });
      const m2 = await db.monthPlan.create({ data: { yearPlanId: year.id, month: 11, title: 'm2' } });
      const w1 = await db.weekPlan.create({ data: { monthPlanId: m1.id, weekStart: '2026-10-19', title: 'w1' } });
      const w2 = await db.weekPlan.create({ data: { monthPlanId: m1.id, weekStart: WEEK, title: 'w2' } });
      const w3 = await db.weekPlan.create({ data: { monthPlanId: m2.id, weekStart: '2026-11-02', title: 'w3' } });
      const taskData = [
        [w1, '2026-10-19'], [w1, '2026-10-20'], [w2, WEEK], [w3, '2026-11-02'], [w3, '2026-11-03'],
      ] as const;
      for (const [w, date] of taskData) {
        await db.dailyTask.create({ data: { weekPlanId: w.id, date, title: 't', order: 1 } });
      }
      return { year, m1, w3 };
    });

    const d = await (await yearDescendants.GET(json('GET'), ctx(year.id))).json();
    expect(d).toEqual({ months: 2, weeks: 3, tasks: 5, total: 10 });

    expect((await monthDescendants.GET(json('GET'), ctx(m1.id)).then((r) => r.json())).total).toBe(5);
    expect((await weekDescendants.GET(json('GET'), ctx(w3.id)).then((r) => r.json())).total).toBe(2);

    expect((await yearById.DELETE(json('DELETE'), ctx(year.id))).status).toBe(204);
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });

  it('deleting a month or week only removes its own subtree', async () => {
    const { month, week } = await createChain();
    await tasks.POST(json('POST', { weekPlanId: week.id, date: WEEK, title: 't' }));
    expect((await weekById.DELETE(json('DELETE'), ctx(week.id))).status).toBe(204);
    expect(await counts()).toEqual([1, 1, 0, 0]);
    expect((await monthById.DELETE(json('DELETE'), ctx(month.id))).status).toBe(204);
    expect(await counts()).toEqual([1, 0, 0, 0]);
  });

  it('404 for descendants and delete of unknown ids', async () => {
    expect((await yearDescendants.GET(json('GET'), ctx('nope'))).status).toBe(404);
    expect((await taskById.DELETE(json('DELETE'), ctx('nope'))).status).toBe(404);
  });
});

describe('AC8: task date must be inside its week', () => {
  it('rejects create and update outside the week range', async () => {
    const { week } = await createChain();
    const res = await tasks.POST(json('POST', { weekPlanId: week.id, date: '2026-11-02', title: 't' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields.date).toContain('2026-10-26 ~ 2026-11-01');

    const task = await (await tasks.POST(json('POST', { weekPlanId: week.id, date: '2026-11-01', title: 't' }))).json();
    const upd = await taskById.PATCH(json('PATCH', { date: '2026-10-25' }), ctx(task.id));
    expect(upd.status).toBe(400);
  });

  it('rejects moving a week so that its tasks fall outside', async () => {
    const { week } = await createChain();
    await tasks.POST(json('POST', { weekPlanId: week.id, date: WEEK, title: 't' }));
    const res = await weekById.PATCH(json('PATCH', { weekStart: '2026-11-02' }), ctx(week.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields.weekStart).toBeTruthy();
  });
});

describe('task status and order', () => {
  it('PATCH updates status and order in the DB', async () => {
    const { week } = await createChain();
    const task = await (await tasks.POST(json('POST', { weekPlanId: week.id, date: WEEK, title: 't' }))).json();
    const res = await taskById.PATCH(json('PATCH', { status: 'done', order: 2.5 }), ctx(task.id));
    expect(res.status).toBe(200);
    expect(await baseDb.dailyTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'done', order: 2.5 });
  });

  it('rejects an unknown status', async () => {
    const { week } = await createChain();
    const task = await (await tasks.POST(json('POST', { weekPlanId: week.id, date: WEEK, title: 't' }))).json();
    expect((await taskById.PATCH(json('PATCH', { status: 'blocked' }), ctx(task.id))).status).toBe(400);
  });

  it('appends new tasks to the end of their column', async () => {
    const { week } = await createChain();
    const a = await (await tasks.POST(json('POST', { weekPlanId: week.id, date: WEEK, title: 'a' }))).json();
    const b = await (await tasks.POST(json('POST', { weekPlanId: week.id, date: WEEK, title: 'b' }))).json();
    expect(b.order).toBeGreaterThan(a.order);
  });
});

describe('GET /api/tasks', () => {
  it('returns week plans and their tasks sorted by order', async () => {
    const { week } = await createChain();
    await tasks.POST(json('POST', { weekPlanId: week.id, date: WEEK, title: 'second', order: 2 }));
    await tasks.POST(json('POST', { weekPlanId: week.id, date: WEEK, title: 'first', order: 1 }));
    const data = await (await tasks.GET(new Request(`http://test/api/tasks?weekStart=${WEEK}`))).json();
    expect(data.weekPlans).toHaveLength(1);
    expect(data.tasks.map((t: { title: string }) => t.title)).toEqual(['first', 'second']);
  });

  it('400 when weekStart is not a Monday', async () => {
    expect((await tasks.GET(new Request('http://test/api/tasks?weekStart=2026-10-27'))).status).toBe(400);
  });
});
