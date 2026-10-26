export const STATUSES = ['todo', 'in_progress', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  todo: '예정',
  in_progress: '진행중',
  done: '완료',
};

export interface YearPlan {
  id: string;
  year: number;
  title: string;
  status: Status;
}

export interface MonthPlan {
  id: string;
  yearPlanId: string;
  month: number;
  title: string;
  status: Status;
}

export interface WeekPlan {
  id: string;
  monthPlanId: string;
  weekStart: string;
  title: string;
  status: Status;
}

export interface DailyTask {
  id: string;
  weekPlanId: string;
  date: string;
  title: string;
  status: Status;
  order: number;
}

export type PlanLevel = 'year' | 'month' | 'week' | 'task';

// Shape returned by GET /api/tree
export interface WeekNode extends WeekPlan {
  taskCount: number;
}
export interface MonthNode extends MonthPlan {
  weeks: WeekNode[];
}
export interface YearNode extends YearPlan {
  months: MonthNode[];
}

// Shape returned by GET /api/tasks?weekStart=
export interface WeekData {
  weekStart: string;
  weekPlans: WeekPlan[];
  tasks: DailyTask[];
}
