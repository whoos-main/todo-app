import { z } from 'zod';
import { isDateInWeek, isISODate, isMonday, weekRange } from './dates';
import { STATUSES } from './types';

const title = z.string().trim().min(1, '제목을 입력해 주세요').max(200, '제목은 200자 이하로 입력해 주세요');
const status = z.enum(STATUSES, { errorMap: () => ({ message: '상태는 예정, 진행중, 완료 중 하나여야 해요' }) });
const parentId = (label: string) =>
  z.string({ required_error: `${label}을(를) 선택해 주세요` }).min(1, `${label}을(를) 선택해 주세요`);

const year = z.number().int().min(2000, '연도는 2000~2100 사이여야 해요').max(2100, '연도는 2000~2100 사이여야 해요');
const month = z.number().int().min(1, '월은 1~12 사이여야 해요').max(12, '월은 1~12 사이여야 해요');
const weekStart = z
  .string()
  .refine(isISODate, '날짜 형식이 올바르지 않아요')
  .refine(isMonday, '주 시작일은 월요일만 선택할 수 있어요');
const date = z.string().refine(isISODate, '날짜 형식이 올바르지 않아요');

export const createYearSchema = z.object({ year, title, status: status.optional() });
export const updateYearSchema = z.object({ year, title, status }).partial();

export const createMonthSchema = z.object({ yearPlanId: parentId('연간 계획'), month, title, status: status.optional() });
export const updateMonthSchema = z.object({ month, title, status }).partial();

export const createWeekSchema = z.object({ monthPlanId: parentId('월간 계획'), weekStart, title, status: status.optional() });
export const updateWeekSchema = z.object({ weekStart, title, status }).partial();

export const createTaskSchema = z.object({
  weekPlanId: parentId('주간 계획'),
  date,
  title,
  status: status.optional(),
  order: z.number().finite().optional(),
});
export const updateTaskSchema = z.object({ date, title, status, order: z.number().finite() }).partial();

/** Error message when a task date falls outside its week plan, else null. */
export function taskDateError(taskDate: string, planWeekStart: string): string | null {
  if (isDateInWeek(taskDate, planWeekStart)) return null;
  const { start, end } = weekRange(planWeekStart);
  return `날짜는 주간 계획 기간(${start} ~ ${end}) 안이어야 해요`;
}

/** Flatten zod issues into { field: message } (first message per field). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}
