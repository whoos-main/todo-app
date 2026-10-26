'use client';

import { useState } from 'react';
import { KanbanBoard } from './KanbanBoard';
import { PlanTree, type TreeItem } from './PlanTree';
import { PlanSummary } from './PlanSummary';
import { PlanForm, LEVEL_LABELS, type FormValues } from './PlanForm';
import { ConfirmDialog } from './ConfirmDialog';
import { ProgressBar } from './ProgressBar';
import { useToast } from './Toast';
import {
  fetchDescendants,
  useCreatePlan,
  useDeletePlan,
  useMoveTask,
  useTree,
  useUpdatePlan,
  useWeek,
} from '@/lib/queries';
import { addDays, isDateInWeek, startOfWeek, toISODate } from '@/domain/dates';
import { dailyProgress, weeklyProgress } from '@/domain/progress';
import type { DailyTask, PlanLevel, WeekPlan } from '@/domain/types';
import type { SessionUser } from '@/lib/auth';

type FormState = {
  level: PlanLevel;
  mode: 'create' | 'edit';
  id?: string;
  initial: FormValues;
  weekPlanOptions?: Pick<WeekPlan, 'id' | 'title'>[];
};

type ConfirmState = { level: PlanLevel; id: string; message: string };

export function TodoApp({ user }: { user: SessionUser }) {
  const toast = useToast();
  const [date, setDate] = useState(() => toISODate(new Date()));
  const weekStart = startOfWeek(date);
  // The next day can fall in the following week (Sunday → Monday)
  const nextDate = addDays(date, 1);
  const nextWeekStart = startOfWeek(nextDate);
  const today = toISODate(new Date());

  const tree = useTree();
  const week = useWeek(weekStart);
  const nextWeek = useWeek(nextWeekStart);
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const moveTask = useMoveTask(weekStart, toast);
  const moveNextTask = useMoveTask(nextWeekStart, toast);

  const [form, setForm] = useState<FormState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const weekPlans = week.data?.weekPlans ?? [];
  const allTasks = week.data?.tasks ?? [];

  function openAdd(level: PlanLevel, parent?: TreeItem) {
    const [y, m] = date.split('-').map(Number);
    const initial: Record<PlanLevel, () => FormValues> = {
      year: () => ({ year: String(y), title: '' }),
      month: () => ({ yearPlanId: parent!.id, month: String(m), title: '' }),
      week: () => ({ monthPlanId: parent!.id, weekStart, title: '' }),
      task: () => {
        const ws = (parent as WeekPlan).weekStart;
        return { weekPlanId: parent!.id, date: isDateInWeek(date, ws) ? date : ws, title: '' };
      },
    };
    setForm({ level, mode: 'create', initial: initial[level]() });
  }

  function openAddTaskFromBoard(day: string, plans: WeekPlan[]) {
    if (plans.length === 0) {
      toast('이 주에 주간 계획이 없어요. 왼쪽 트리에서 주간 계획을 먼저 추가해 주세요');
      return;
    }
    setForm({
      level: 'task',
      mode: 'create',
      initial: { weekPlanId: plans[0].id, date: day, title: '' },
      weekPlanOptions: plans,
    });
  }

  function openEdit(level: PlanLevel, item: TreeItem | DailyTask) {
    const fields: Record<PlanLevel, string[]> = {
      year: ['year', 'title', 'status'],
      month: ['month', 'title', 'status'],
      week: ['weekStart', 'title', 'status'],
      task: ['date', 'title', 'status'],
    };
    const source = item as unknown as Record<string, unknown>;
    const initial = Object.fromEntries(fields[level].map((f) => [f, String(source[f])]));
    setForm({ level, mode: 'edit', id: item.id, initial });
  }

  async function openDelete(level: PlanLevel, item: { id: string; title: string }) {
    let message = `"${item.title}"을(를) 삭제할까요?`;
    if (level !== 'task') {
      try {
        const d = await fetchDescendants(level, item.id);
        if (d.total > 0) message += ` 하위 항목 ${d.total}개(월간 ${d.months}, 주간 ${d.weeks}, 할 일 ${d.tasks})도 함께 삭제돼요.`;
      } catch (e) {
        toast(e instanceof Error ? e.message : '하위 항목 수를 불러오지 못했어요');
        return;
      }
    }
    setConfirm({ level, id: item.id, message });
  }

  async function submitForm(data: Record<string, unknown>) {
    if (!form) return;
    if (form.mode === 'create') await createPlan.mutateAsync({ level: form.level, data });
    else await updatePlan.mutateAsync({ level: form.level, id: form.id!, data });
    // The boards show two days, so follow a task saved to any other day or it looks lost
    if (form.level === 'task' && typeof data.date === 'string' && data.date !== date && data.date !== nextDate) {
      setDate(data.date);
      toast(`${data.date} 할 일로 이동했어요`);
    }
  }

  async function confirmDelete() {
    if (!confirm) return;
    try {
      await deletePlan.mutateAsync({ level: confirm.level, id: confirm.id });
    } catch (e) {
      toast(e instanceof Error ? e.message : '삭제하지 못했어요');
    }
    setConfirm(null);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>할 일 계획</h1>
        <div className="date-nav">
          <button type="button" onClick={() => setDate(addDays(date, -1))} aria-label="이전 날">
            ◀
          </button>
          <input type="date" aria-label="날짜 선택" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button type="button" onClick={() => setDate(toISODate(new Date()))}>
            오늘
          </button>
          <button type="button" onClick={() => setDate(addDays(date, 1))} aria-label="다음 날">
            ▶
          </button>
        </div>
        <div className="progress-group">
          <ProgressBar label="일간" value={week.data ? dailyProgress(allTasks, date) : null} />
          <ProgressBar label="주간" value={week.data ? weeklyProgress(weekPlans, allTasks, weekStart) : null} />
        </div>
        <form className="user-menu" action="/auth/logout" method="post">
          <img src={user.avatarUrl} alt="" width={28} height={28} />
          <span>{user.username}</span>
          <button type="submit">로그아웃</button>
        </form>
      </header>

      <main className="layout">
        <aside>
          {tree.isPending ? (
            <p className="muted">불러오는 중…</p>
          ) : tree.isError ? (
            <p className="field-error">계획을 불러오지 못했어요: {tree.error.message}</p>
          ) : (
            <PlanTree
              years={tree.data}
              selectedWeekStart={weekStart}
              onAdd={openAdd}
              onEdit={openEdit}
              onDelete={openDelete}
              onSelectWeek={(w) => !isDateInWeek(date, w.weekStart) && setDate(w.weekStart)}
            />
          )}
        </aside>

        <div className="board-area">
          <PlanSummary
            date={date}
            weekStart={weekStart}
            years={tree.data}
            weekPlans={weekPlans}
            tasks={allTasks}
            onSelectDate={setDate}
          />
          {[
            { day: date, tag: date === today ? '오늘' : '선택한 날', query: week, move: moveTask },
            { day: nextDate, tag: nextDate === addDays(today, 1) ? '내일' : '다음 날', query: nextWeek, move: moveNextTask },
          ].map(({ day, tag, query, move }) => (
            <section key={tag} className="day-board" aria-label={`${day} 할 일`}>
              <h2>
                <span className="day-tag">{tag}</span> {day} 할 일
              </h2>
              {query.isError ? (
                <p className="field-error">할 일을 불러오지 못했어요: {query.error.message}</p>
              ) : (
                <KanbanBoard
                  tasks={(query.data?.tasks ?? []).filter((t) => t.date === day)}
                  onMove={(id, status, order) => move.mutate({ id, status, order })}
                  onAdd={() => openAddTaskFromBoard(day, query.data?.weekPlans ?? [])}
                  onEdit={(t) => openEdit('task', t)}
                  onDelete={(t) => openDelete('task', t)}
                />
              )}
            </section>
          ))}
        </div>
      </main>

      {form && (
        <PlanForm
          key={`${form.level}-${form.mode}-${form.id ?? 'new'}`}
          level={form.level}
          mode={form.mode}
          initial={form.initial}
          weekPlanOptions={form.weekPlanOptions}
          onSubmit={submitForm}
          onClose={() => setForm(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`${LEVEL_LABELS[confirm.level]} 삭제`}
          message={confirm.message}
          busy={deletePlan.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
