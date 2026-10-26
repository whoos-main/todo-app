'use client';

import { useState } from 'react';
import { StatusBadge } from './PlanTree';
import { ProgressBar } from './ProgressBar';
import { addDays, dayOfWeek, isDateInWeek, startOfWeek, weekRange } from '@/domain/dates';
import { dailyProgress, weekPlanRatio, weeklyProgress } from '@/domain/progress';
import { useWeeks } from '@/lib/queries';
import { STATUSES, STATUS_LABELS, type DailyTask, type Status, type WeekPlan, type YearNode } from '@/domain/types';

type View = 'week' | 'month' | 'year' | 'dashboard';

const VIEWS: { view: View; label: string }[] = [
  { view: 'week', label: '주간 계획' },
  { view: 'month', label: '월간 계획' },
  { view: 'year', label: '연간 계획' },
  { view: 'dashboard', label: '대시보드' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  date: string;
  weekStart: string;
  years: YearNode[] | undefined;
  weekPlans: WeekPlan[];
  tasks: DailyTask[];
  onSelectDate: (date: string) => void;
}

const range = (weekStart: string) => `${weekStart.slice(5)}~${weekRange(weekStart).end.slice(5)}`;
const yearMonth = (date: string) => date.split('-').map(Number) as [number, number, number];
const doneOf = (items: { status: Status }[]) => items.filter((i) => i.status === 'done').length;
const dayLabel = (d: string) => `${d.slice(5)} (${WEEKDAYS[dayOfWeek(d)]})`;

/** Every day of the month containing `date`, as ISO dates. */
function monthDays(date: string): string[] {
  const days: string[] = [];
  for (let d = `${date.slice(0, 7)}-01`; d.startsWith(date.slice(0, 7)); d = addDays(d, 1)) days.push(d);
  return days;
}

/** Tasks grouped by day. Days without tasks are listed only when `showEmpty` is set. */
function Agenda({ title, days, tasks, date, showEmpty, onSelectDate }: {
  title: string;
  days: string[];
  tasks: DailyTask[];
  date: string;
  showEmpty: boolean;
  onSelectDate: (date: string) => void;
}) {
  const byDay = days.map((d) => ({ day: d, items: tasks.filter((t) => t.date === d) }));
  const shown = showEmpty ? byDay : byDay.filter((g) => g.items.length > 0);
  return (
    <div className="agenda">
      <h3>
        {title} <span className="muted">{tasks.length}개</span>
      </h3>
      {shown.length === 0 && <p className="muted">예정된 일정이 없어요.</p>}
      <ul className="summary-list">
        {shown.map(({ day, items }) => (
          <li key={day} className={`agenda-day${day === date ? ' selected' : ''}`}>
            <button type="button" className="link agenda-date" onClick={() => onSelectDate(day)}>
              {dayLabel(day)}
            </button>
            {items.length === 0 ? (
              <span className="muted">일정 없음</span>
            ) : (
              <ul className="summary-list agenda-items">
                {items.map((t) => (
                  <li key={t.id} className="summary-row">
                    <span className={`tree-title${t.status === 'done' ? ' done' : ''}`}>{t.title}</span>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeekSummary({ date, weekStart, weekPlans, tasks, onSelectDate }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <>
      {weekPlans.length === 0 ? (
        <p className="muted">{range(weekStart)} 주에 주간 계획이 없어요.</p>
      ) : (
        <ul className="summary-list">
          {weekPlans.map((p) => {
            const own = tasks.filter((t) => t.weekPlanId === p.id);
            return (
              <li key={p.id} className="summary-row">
                <span className="tree-title">
                  {range(p.weekStart)} · {p.title}
                </span>
                <span className="muted">
                  {own.length === 0 ? '할 일 없음' : `할 일 ${doneOf(own)}/${own.length} · ${Math.round(weekPlanRatio(p, tasks) * 100)}%`}
                </span>
                <StatusBadge status={p.status} />
              </li>
            );
          })}
        </ul>
      )}
      <Agenda title="이번 주 일정" days={days} tasks={tasks} date={date} showEmpty onSelectDate={onSelectDate} />
    </>
  );
}

function MonthSummary({ date, weekStart, years, onSelectDate }: Props) {
  const [y, m] = yearMonth(date);
  const days = monthDays(date);
  const weekStarts: string[] = [];
  for (let ws = startOfWeek(days[0]); ws <= days[days.length - 1]; ws = addDays(ws, 7)) weekStarts.push(ws);
  const weeks = useWeeks(weekStarts);
  const monthTasks = weeks.flatMap((q) => q.data?.tasks ?? []).filter((t) => t.date.startsWith(date.slice(0, 7)));

  if (!years) return <p className="muted">불러오는 중…</p>;
  const months = years.filter((yp) => yp.year === y).flatMap((yp) => yp.months.filter((mp) => mp.month === m));
  return (
    <>
      {months.length === 0 && <p className="muted">{y}년 {m}월에 월간 계획이 없어요.</p>}
      <ul className="summary-list">
        {months.map((mp) => (
          <li key={mp.id}>
            <div className="summary-row">
              <span className="tree-title">
                <strong>{mp.month}월</strong> · {mp.title}
              </span>
              <StatusBadge status={mp.status} />
            </div>
            {mp.weeks.length === 0 ? (
              <p className="muted summary-sub">주간 계획 없음</p>
            ) : (
              <ul className="summary-list summary-sub">
                {mp.weeks.map((w) => (
                  <li key={w.id} className={`summary-row${w.weekStart === weekStart ? ' selected' : ''}`}>
                    <button
                      type="button"
                      className="tree-title link"
                      onClick={() => !isDateInWeek(date, w.weekStart) && onSelectDate(w.weekStart)}
                    >
                      {range(w.weekStart)} · {w.title}
                      <span className="muted"> ({w.taskCount})</span>
                    </button>
                    <StatusBadge status={w.status} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {weeks.some((q) => q.isPending) ? (
        <p className="muted">일정을 불러오는 중…</p>
      ) : (
        <Agenda title={`${m}월 일정`} days={days} tasks={monthTasks} date={date} showEmpty={false} onSelectDate={onSelectDate} />
      )}
    </>
  );
}

function YearSummary({ date, years, onSelectDate }: Props) {
  const [y, m] = yearMonth(date);
  if (!years) return <p className="muted">불러오는 중…</p>;
  const plans = years.filter((yp) => yp.year === y);
  if (plans.length === 0) return <p className="muted">{y}년에 연간 계획이 없어요.</p>;
  return (
    <ul className="summary-list">
      {plans.map((yp) => (
        <li key={yp.id}>
          <div className="summary-row">
            <span className="tree-title">
              <strong>{yp.year}</strong> · {yp.title}
            </span>
            <span className="muted">월간 {doneOf(yp.months)}/{yp.months.length} 완료</span>
            <StatusBadge status={yp.status} />
          </div>
          {yp.months.length === 0 ? (
            <p className="muted summary-sub">월간 계획 없음</p>
          ) : (
            <ul className="summary-list summary-sub">
              {yp.months.map((mp) => (
                <li key={mp.id} className={`summary-row${mp.month === m ? ' selected' : ''}`}>
                  <button
                    type="button"
                    className="tree-title link"
                    onClick={() => mp.month !== m && onSelectDate(`${y}-${String(mp.month).padStart(2, '0')}-01`)}
                  >
                    {mp.month}월 · {mp.title}
                    <span className="muted"> (주간 {mp.weeks.length})</span>
                  </button>
                  <StatusBadge status={mp.status} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Dashboard({ date, weekStart, years, weekPlans, tasks }: Props) {
  const [y] = yearMonth(date);
  const months = (years ?? []).filter((yp) => yp.year === y).flatMap((yp) => yp.months);
  const weeks = months.flatMap((mp) => mp.weeks);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="dashboard">
      <div>
        <h3>이번 주 할 일 ({range(weekStart)})</h3>
        <dl className="stat-tiles">
          <div className="stat">
            <dt>전체</dt>
            <dd>{tasks.length}</dd>
          </div>
          {STATUSES.map((s) => (
            <div key={s} className={`stat stat-${s}`}>
              <dt>{STATUS_LABELS[s]}</dt>
              <dd>{tasks.filter((t) => t.status === s).length}</dd>
            </div>
          ))}
        </dl>
        <ProgressBar label="주간" value={weeklyProgress(weekPlans, tasks, weekStart)} />
      </div>

      <div>
        <h3>요일별 진행률</h3>
        {days.map((d) => (
          <div key={d} className={d === date ? 'day-row selected' : 'day-row'}>
            <ProgressBar label={`${WEEKDAYS[dayOfWeek(d)]} ${d.slice(5)}`} value={dailyProgress(tasks, d)} />
          </div>
        ))}
      </div>

      <div>
        <h3>{y}년 계획 현황</h3>
        {years === undefined ? (
          <p className="muted">불러오는 중…</p>
        ) : (
          <dl className="stat-tiles">
            <div className="stat">
              <dt>월간 계획 완료</dt>
              <dd>
                {doneOf(months)}/{months.length}
              </dd>
            </div>
            <div className="stat">
              <dt>주간 계획 완료</dt>
              <dd>
                {doneOf(weeks)}/{weeks.length}
              </dd>
            </div>
            <div className="stat">
              <dt>등록된 할 일</dt>
              <dd>{weeks.reduce((n, w) => n + w.taskCount, 0)}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}

const PANELS: Record<View, (props: Props) => React.ReactNode> = {
  week: WeekSummary,
  month: MonthSummary,
  year: YearSummary,
  dashboard: Dashboard,
};

/** Menu above the daily boards: 일간 일정 shows just the boards, the others toggle an overview panel. */
export function PlanSummary(props: Props) {
  const [view, setView] = useState<View | null>(null);
  const Panel = view && PANELS[view];

  return (
    <div className="plan-summary">
      <div className="view-menu" role="group" aria-label="계획 보기">
        {/* The daily boards are always below; this just closes any open panel */}
        <button type="button" aria-pressed={view === null} onClick={() => setView(null)}>
          일간 일정
        </button>
        {VIEWS.map((v) => (
          <button key={v.view} type="button" aria-pressed={view === v.view} onClick={() => setView((cur) => (cur === v.view ? null : v.view))}>
            {v.label}
          </button>
        ))}
      </div>
      {view && Panel && (
        <section className="summary-panel" aria-label={view === 'dashboard' ? '대시보드' : `${VIEWS.find((v) => v.view === view)!.label} 요약`}>
          <Panel {...props} />
        </section>
      )}
    </div>
  );
}
