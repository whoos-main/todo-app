'use client';

import { useState } from 'react';
import { Modal } from './Modal';
import { ApiClientError } from '@/lib/http';
import { STATUSES, STATUS_LABELS, type PlanLevel, type WeekPlan } from '@/domain/types';

export const LEVEL_LABELS: Record<PlanLevel, string> = {
  year: '연간 계획',
  month: '월간 계획',
  week: '주간 계획',
  task: '할 일',
};

export type FormValues = Record<string, string>;

interface Props {
  level: PlanLevel;
  mode: 'create' | 'edit';
  initial: FormValues;
  /** For a task created from the board, the week plans it can belong to */
  weekPlanOptions?: Pick<WeekPlan, 'id' | 'title'>[];
  onSubmit: (data: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}

function toPayload(level: PlanLevel, values: FormValues): Record<string, unknown> {
  const data: Record<string, unknown> = { ...values };
  if (level === 'year' && values.year !== undefined) data.year = Number(values.year);
  if (level === 'month' && values.month !== undefined) data.month = Number(values.month);
  return data;
}

export function PlanForm({ level, mode, initial, weekPlanOptions, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (name: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await onSubmit(toPayload(level, values));
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.fields) setErrors(err.fields);
      else setFormError(err instanceof Error ? err.message : '저장하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  const field = (name: string, label: string, input: React.ReactNode) => (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}</label>
      {input}
      {errors[name] && (
        <p className="field-error" id={`f-${name}-error`}>
          {errors[name]}
        </p>
      )}
    </div>
  );
  const inputProps = (name: string) => ({
    id: `f-${name}`,
    value: values[name] ?? '',
    onChange: set(name),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `f-${name}-error` : undefined,
  });

  return (
    <Modal title={`${LEVEL_LABELS[level]} ${mode === 'create' ? '추가' : '수정'}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {formError && <p className="field-error">{formError}</p>}

        {level === 'task' && weekPlanOptions &&
          field(
            'weekPlanId',
            '주간 계획',
            <select {...inputProps('weekPlanId')}>
              {weekPlanOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>,
          )}
        {level === 'year' && field('year', '연도', <input type="number" {...inputProps('year')} />)}
        {level === 'month' &&
          field(
            'month',
            '월',
            <select {...inputProps('month')}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}월
                </option>
              ))}
            </select>,
          )}
        {level === 'week' && field('weekStart', '주 시작일 (월요일)', <input type="date" {...inputProps('weekStart')} />)}
        {level === 'task' && field('date', '날짜', <input type="date" {...inputProps('date')} />)}
        {field('title', '제목', <input type="text" autoFocus {...inputProps('title')} />)}
        {mode === 'edit' &&
          field(
            'status',
            '상태',
            <select {...inputProps('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>,
          )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary" disabled={busy}>
            저장
          </button>
        </div>
      </form>
    </Modal>
  );
}
