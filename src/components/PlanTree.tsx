'use client';

import { STATUS_LABELS, type MonthNode, type PlanLevel, type WeekNode, type YearNode } from '@/domain/types';
import { weekRange } from '@/domain/dates';

export type TreeItem = YearNode | MonthNode | WeekNode;

interface Props {
  years: YearNode[];
  selectedWeekStart: string;
  onAdd: (level: PlanLevel, parent?: TreeItem) => void;
  onEdit: (level: PlanLevel, item: TreeItem) => void;
  onDelete: (level: Exclude<PlanLevel, 'task'>, item: TreeItem) => void;
  onSelectWeek: (week: WeekNode) => void;
}

function Actions({ name, onAdd, addLabel, onEdit, onDelete }: {
  name: string;
  onAdd: () => void;
  addLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="tree-actions">
      <button type="button" onClick={onAdd} aria-label={`${name}에 ${addLabel} 추가`} title={`${addLabel} 추가`}>
        +
      </button>
      <button type="button" onClick={onEdit} aria-label={`${name} 수정`} title="수정">
        ✎
      </button>
      <button type="button" onClick={onDelete} aria-label={`${name} 삭제`} title="삭제">
        ×
      </button>
    </span>
  );
}

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABELS }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function PlanTree({ years, selectedWeekStart, onAdd, onEdit, onDelete, onSelectWeek }: Props) {
  return (
    <nav className="tree" aria-label="계획 트리">
      <div className="tree-header">
        <h2>계획</h2>
        <button type="button" className="primary" onClick={() => onAdd('year')}>
          + 연간 계획
        </button>
      </div>
      {years.length === 0 && <p className="muted">연간 계획을 추가해 시작하세요.</p>}
      <ul>
        {years.map((y) => (
          <li key={y.id}>
            <div className="tree-row level-year">
              <span className="tree-title">
                {y.year} · {y.title}
              </span>
              <StatusBadge status={y.status} />
              <Actions name={y.title} addLabel="월간 계획" onAdd={() => onAdd('month', y)} onEdit={() => onEdit('year', y)} onDelete={() => onDelete('year', y)} />
            </div>
            <ul>
              {y.months.map((m) => (
                <li key={m.id}>
                  <div className="tree-row level-month">
                    <span className="tree-title">
                      {m.month}월 · {m.title}
                    </span>
                    <StatusBadge status={m.status} />
                    <Actions name={m.title} addLabel="주간 계획" onAdd={() => onAdd('week', m)} onEdit={() => onEdit('month', m)} onDelete={() => onDelete('month', m)} />
                  </div>
                  <ul>
                    {m.weeks.map((w) => {
                      const { end } = weekRange(w.weekStart);
                      return (
                        <li key={w.id}>
                          <div className={`tree-row level-week${w.weekStart === selectedWeekStart ? ' selected' : ''}`}>
                            <button type="button" className="tree-title link" onClick={() => onSelectWeek(w)}>
                              {w.weekStart.slice(5)}~{end.slice(5)} · {w.title}
                              <span className="muted"> ({w.taskCount})</span>
                            </button>
                            <StatusBadge status={w.status} />
                            <Actions name={w.title} addLabel="할 일" onAdd={() => onAdd('task', w)} onEdit={() => onEdit('week', w)} onDelete={() => onDelete('week', w)} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
