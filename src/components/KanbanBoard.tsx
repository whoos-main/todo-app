'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { STATUSES, STATUS_LABELS, type DailyTask, type Status } from '@/domain/types';
import { COLUMN_PREFIX, computeDrop, toColumns } from '@/domain/ordering';

interface Props {
  tasks: DailyTask[];
  onMove: (id: string, status: Status, order: number) => void;
  onAdd: () => void;
  onEdit: (task: DailyTask) => void;
  onDelete: (task: DailyTask) => void;
}

// Card buttons must not start a drag (pointer) or pick the card up (Enter/Space)
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function TaskCard({ task, onEdit, onDelete }: { task: DailyTask; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <li
      ref={setNodeRef}
      className={`card card-${task.status}${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="task-card"
      data-status={task.status}
      {...attributes}
      {...listeners}
      aria-label={task.title}
      aria-roledescription="드래그 가능한 할 일"
    >
      <span className="card-title">{task.title}</span>
      <span className="card-actions">
        <button type="button" onPointerDown={stop} onKeyDown={stop} onClick={onEdit} aria-label={`${task.title} 수정`}>
          ✎
        </button>
        <button type="button" onPointerDown={stop} onKeyDown={stop} onClick={onDelete} aria-label={`${task.title} 삭제`}>
          ×
        </button>
      </span>
    </li>
  );
}

function Column({ status, tasks, children }: { status: Status; tasks: DailyTask[]; children?: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status}` });
  return (
    <section className={`column${isOver ? ' over' : ''}`} aria-label={`${STATUS_LABELS[status]} 컬럼`} data-column={status}>
      <h3>
        {STATUS_LABELS[status]} <span className="muted">{tasks.length}</span>
      </h3>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="card-list">
          {children}
        </ul>
      </SortableContext>
    </section>
  );
}

export function KanbanBoard({ tasks, onMove, onAdd, onEdit, onDelete }: Props) {
  const columns = useMemo(() => toColumns(tasks), [tasks]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const drop = computeDrop(columns, String(active.id), String(over.id));
    if (drop) onMove(String(active.id), drop.status, drop.order);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }: DragStartEvent) => setActiveId(String(active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="board">
        {STATUSES.map((status) => (
          <Column key={status} status={status} tasks={columns[status]}>
            {columns[status].map((t) => (
              <TaskCard key={t.id} task={t} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
            ))}
            {status === 'todo' && (
              <li className="card-add">
                <button type="button" onClick={onAdd}>
                  + 할 일
                </button>
              </li>
            )}
          </Column>
        ))}
      </div>
      <DragOverlay>{active && <div className={`card card-${active.status} overlay`}>{active.title}</div>}</DragOverlay>
    </DndContext>
  );
}
