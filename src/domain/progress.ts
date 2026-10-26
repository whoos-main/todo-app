import type { DailyTask, Status, WeekPlan } from './types';

type TaskLike = Pick<DailyTask, 'status' | 'date' | 'weekPlanId'>;
type WeekPlanLike = Pick<WeekPlan, 'id' | 'status' | 'weekStart'>;

function toPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

function doneRatio(items: { status: Status }[]): number {
  return items.filter((t) => t.status === 'done').length / items.length;
}

/** Done / total tasks on `date`, as a rounded percent. null when there are no tasks. */
export function dailyProgress(tasks: TaskLike[], date: string): number | null {
  const today = tasks.filter((t) => t.date === date);
  if (today.length === 0) return null;
  return toPercent(doneRatio(today));
}

/** 0..1 for one week plan: its tasks' done ratio, or its own status when it has no tasks. */
export function weekPlanRatio(plan: WeekPlanLike, tasks: TaskLike[]): number {
  const own = tasks.filter((t) => t.weekPlanId === plan.id);
  if (own.length === 0) return plan.status === 'done' ? 1 : 0;
  return doneRatio(own);
}

/** Average of the week plans' ratios for `weekStart`, as a rounded percent. null when there are no plans. */
export function weeklyProgress(
  weekPlans: WeekPlanLike[],
  tasks: TaskLike[],
  weekStart: string,
): number | null {
  const plans = weekPlans.filter((p) => p.weekStart === weekStart);
  if (plans.length === 0) return null;
  const sum = plans.reduce((acc, p) => acc + weekPlanRatio(p, tasks), 0);
  return toPercent(sum / plans.length);
}
