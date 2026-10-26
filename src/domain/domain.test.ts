import { describe, expect, it } from 'vitest';
import { addDays, isDateInWeek, isISODate, isMonday, startOfWeek, weekRange } from './dates';
import { dailyProgress, weeklyProgress } from './progress';
import { computeDrop, orderBetween, toColumns } from './ordering';
import {
  createMonthSchema,
  createTaskSchema,
  createWeekSchema,
  taskDateError,
  updateTaskSchema,
} from './validation';
import type { DailyTask, Status, WeekPlan } from './types';

const task = (status: Status, date = '2026-10-26', weekPlanId = 'w1'): DailyTask => ({
  id: Math.random().toString(36),
  weekPlanId,
  date,
  title: 't',
  status,
  order: 1,
});
const plan = (id: string, status: Status = 'todo', weekStart = '2026-10-26'): WeekPlan => ({
  id,
  monthPlanId: 'm1',
  weekStart,
  title: id,
  status,
});

describe('dates', () => {
  it('detects Mondays without timezone drift', () => {
    expect(isMonday('2026-10-26')).toBe(true);
    expect(isMonday('2026-10-25')).toBe(false);
    expect(isMonday('2026-11-02')).toBe(true);
  });

  it('rejects malformed and impossible dates', () => {
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-1-5')).toBe(false);
    expect(isISODate('2024-02-29')).toBe(true);
  });

  it('computes week boundaries across months and years', () => {
    expect(weekRange('2026-09-28')).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28');
    expect(startOfWeek('2026-10-26')).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('checks whether a date is inside a week', () => {
    expect(isDateInWeek('2026-10-26', '2026-10-26')).toBe(true);
    expect(isDateInWeek('2026-11-01', '2026-10-26')).toBe(true);
    expect(isDateInWeek('2026-11-02', '2026-10-26')).toBe(false);
    expect(isDateInWeek('2026-10-25', '2026-10-26')).toBe(false);
  });
});

describe('dailyProgress', () => {
  it('AC4: 2 of 3 done → 67', () => {
    expect(dailyProgress([task('done'), task('done'), task('todo')], '2026-10-26')).toBe(67);
  });

  it('AC5: no tasks → null', () => {
    expect(dailyProgress([], '2026-10-26')).toBeNull();
    expect(dailyProgress([task('done', '2026-10-27')], '2026-10-26')).toBeNull();
  });

  it('only counts tasks on the given date', () => {
    expect(dailyProgress([task('done'), task('todo', '2026-10-27')], '2026-10-26')).toBe(100);
  });

  it('AC9: removing a done task lowers progress', () => {
    const tasks = [task('done'), task('todo')];
    expect(dailyProgress(tasks, '2026-10-26')).toBe(50);
    expect(dailyProgress(tasks.slice(1), '2026-10-26')).toBe(0);
  });
});

describe('weeklyProgress', () => {
  it('AC6: plan A 2/4 done + plan B no tasks and done → 75', () => {
    const tasks = [task('done', '2026-10-26', 'A'), task('done', '2026-10-27', 'A'), task('todo', '2026-10-28', 'A'), task('in_progress', '2026-10-29', 'A')];
    expect(weeklyProgress([plan('A'), plan('B', 'done')], tasks, '2026-10-26')).toBe(75);
  });

  it('no plans in the week → null', () => {
    expect(weeklyProgress([plan('A', 'done', '2026-10-19')], [], '2026-10-26')).toBeNull();
  });

  it('a plan without tasks that is not done counts as 0', () => {
    expect(weeklyProgress([plan('A', 'in_progress')], [], '2026-10-26')).toBe(0);
  });

  it('AC9: changing a task status recalculates', () => {
    const tasks = [task('todo', '2026-10-26', 'A')];
    expect(weeklyProgress([plan('A')], tasks, '2026-10-26')).toBe(0);
    expect(weeklyProgress([plan('A')], [{ ...tasks[0], status: 'done' }], '2026-10-26')).toBe(100);
  });
});

describe('orderBetween', () => {
  it('returns midpoints and extends the ends', () => {
    expect(orderBetween(1, 2)).toBe(1.5);
    expect(orderBetween(undefined, 1)).toBe(0);
    expect(orderBetween(3, undefined)).toBe(4);
    expect(orderBetween()).toBe(1);
  });
});

describe('computeDrop', () => {
  const card = (id: string, status: Status, order: number): DailyTask => ({ ...task(status), id, order });
  const columns = toColumns([
    card('a', 'todo', 1),
    card('b', 'todo', 2),
    card('c', 'todo', 3),
    card('d', 'in_progress', 1),
  ]);

  it('dropping on a column appends to its end with the new status', () => {
    expect(computeDrop(columns, 'a', 'column:in_progress')).toEqual({ status: 'in_progress', order: 2 });
    expect(computeDrop(columns, 'a', 'column:done')).toEqual({ status: 'done', order: 1 });
  });

  it('dropping on a card in another column inserts before it', () => {
    expect(computeDrop(columns, 'b', 'd')).toEqual({ status: 'in_progress', order: 0 });
  });

  it('reorders within a column in both directions', () => {
    expect(computeDrop(columns, 'a', 'c')).toEqual({ status: 'todo', order: 4 });
    expect(computeDrop(columns, 'c', 'a')).toEqual({ status: 'todo', order: 0 });
    expect(computeDrop(columns, 'a', 'b')).toEqual({ status: 'todo', order: 2.5 });
  });

  it('returns null when nothing changes', () => {
    expect(computeDrop(columns, 'a', 'a')).toBeNull();
    expect(computeDrop(columns, 'c', 'column:todo')).toBeNull();
    expect(computeDrop(columns, 'zzz', 'a')).toBeNull();
  });
});

describe('validation', () => {
  it('rejects months outside 1-12', () => {
    expect(createMonthSchema.safeParse({ yearPlanId: 'y', month: 0, title: 'a' }).success).toBe(false);
    expect(createMonthSchema.safeParse({ yearPlanId: 'y', month: 13, title: 'a' }).success).toBe(false);
    expect(createMonthSchema.safeParse({ yearPlanId: 'y', month: 12, title: 'a' }).success).toBe(true);
  });

  it('rejects a weekStart that is not a Monday', () => {
    const r = createWeekSchema.safeParse({ monthPlanId: 'm', weekStart: '2026-10-25', title: 'a' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain('월요일');
  });

  it('rejects an unknown status and an empty title', () => {
    expect(updateTaskSchema.safeParse({ status: 'blocked' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ weekPlanId: 'w', date: '2026-10-26', title: '  ' }).success).toBe(false);
  });

  it('rejects a task date outside the week plan', () => {
    expect(taskDateError('2026-11-02', '2026-10-26')).toContain('2026-10-26 ~ 2026-11-01');
    expect(taskDateError('2026-11-01', '2026-10-26')).toBeNull();
  });
});
