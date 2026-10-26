'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './http';
import type { DailyTask, PlanLevel, Status, WeekData, YearNode } from '@/domain/types';

export const LEVEL_PATH: Record<PlanLevel, string> = {
  year: '/api/years',
  month: '/api/months',
  week: '/api/weeks',
  task: '/api/tasks',
};

export const queryKeys = {
  tree: ['tree'] as const,
  week: (weekStart: string) => ['week', weekStart] as const,
};

export function useTree() {
  return useQuery({ queryKey: queryKeys.tree, queryFn: () => apiFetch<YearNode[]>('/api/tree') });
}

const weekQuery = (weekStart: string) => ({
  queryKey: queryKeys.week(weekStart),
  queryFn: () => apiFetch<WeekData>(`/api/tasks?weekStart=${weekStart}`),
});

export function useWeek(weekStart: string) {
  return useQuery(weekQuery(weekStart));
}

/** Several weeks at once (e.g. every week touching a month), sharing the per-week cache. */
export function useWeeks(weekStarts: string[]) {
  return useQueries({ queries: weekStarts.map(weekQuery) });
}

export interface Descendants {
  months: number;
  weeks: number;
  tasks: number;
  total: number;
}

export function fetchDescendants(level: Exclude<PlanLevel, 'task'>, id: string) {
  return apiFetch<Descendants>(`${LEVEL_PATH[level]}/${id}/descendants`);
}

/** Any create/update/delete can change both the tree and every week's progress. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.tree }), qc.invalidateQueries({ queryKey: ['week'] })]);
}

export function useCreatePlan() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ level, data }: { level: PlanLevel; data: Record<string, unknown> }) =>
      apiFetch(LEVEL_PATH[level], { method: 'POST', body: data }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlan() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ level, id, data }: { level: PlanLevel; id: string; data: Record<string, unknown> }) =>
      apiFetch(`${LEVEL_PATH[level]}/${id}`, { method: 'PATCH', body: data }),
    onSuccess: invalidate,
  });
}

export function useDeletePlan() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ level, id }: { level: PlanLevel; id: string }) =>
      apiFetch(`${LEVEL_PATH[level]}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export interface MoveTaskInput {
  id: string;
  status: Status;
  order: number;
}

const MOVE_TASK_KEY = ['move-task'];

/** Moves a card optimistically; rolls the cache back if the server rejects it. */
export function useMoveTask(weekStart: string, onError: (message: string) => void) {
  const qc = useQueryClient();
  const key = queryKeys.week(weekStart);

  return useMutation({
    mutationKey: MOVE_TASK_KEY,
    // Run moves one at a time so two quick moves of a card reach the server in order
    scope: { id: 'move-task' },
    mutationFn: ({ id, status, order }: MoveTaskInput) =>
      apiFetch<DailyTask>(`/api/tasks/${id}`, { method: 'PATCH', body: { status, order } }),
    onMutate: async ({ id, status, order }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<WeekData>(key);
      qc.setQueryData<WeekData>(key, (data) =>
        data && { ...data, tasks: data.tasks.map((t) => (t.id === id ? { ...t, status, order } : t)) },
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      // With other moves queued the snapshot is stale (it holds their changes too), so rely on the refetch instead
      const onlyMove = qc.isMutating({ mutationKey: MOVE_TASK_KEY }) === 1;
      if (onlyMove && context?.previous) qc.setQueryData(key, context.previous);
      onError(`할 일을 옮기지 못했어요: ${err.message}`);
    },
    onSettled: (_data, error) => {
      // Refetching while later moves are queued would briefly undo their optimistic state,
      // unless this move failed and the server state is the only reliable source
      if (error || qc.isMutating({ mutationKey: MOVE_TASK_KEY }) === 1) return qc.invalidateQueries({ queryKey: key });
    },
  });
}
