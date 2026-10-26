import { STATUSES, type DailyTask, type Status } from './types';

/**
 * Order value for a card placed between `prev` and `next` (either may be
 * missing at the ends of a column). Using midpoints means no other card has
 * to be renumbered.
 */
export function orderBetween(prev?: number, next?: number): number {
  if (prev === undefined && next === undefined) return 1;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

export const COLUMN_PREFIX = 'column:';

export type Columns = Record<Status, DailyTask[]>;

/** Groups tasks into the three status columns, each sorted by order. */
export function toColumns(tasks: DailyTask[]): Columns {
  const columns = Object.fromEntries(STATUSES.map((s) => [s, [] as DailyTask[]])) as Columns;
  for (const t of tasks) columns[t.status].push(t);
  for (const s of STATUSES) columns[s].sort((a, b) => a.order - b.order);
  return columns;
}

/**
 * Where a dragged card lands. `overId` is either another card's id (drop
 * onto that card's position) or a column id (drop at the end of the column).
 * Returns null when the card would end up where it already is.
 */
export function computeDrop(columns: Columns, activeId: string, overId: string): { status: Status; order: number } | null {
  const all = STATUSES.flatMap((s) => columns[s]);
  const active = all.find((t) => t.id === activeId);
  if (!active) return null;

  let status: Status;
  let list: DailyTask[];
  if (overId.startsWith(COLUMN_PREFIX)) {
    status = overId.slice(COLUMN_PREFIX.length) as Status;
    list = [...columns[status].filter((t) => t.id !== activeId), active];
  } else {
    const over = all.find((t) => t.id === overId);
    if (!over) return null;
    status = over.status;
    const full = columns[status];
    const overIndex = full.indexOf(over);
    list = full.filter((t) => t.id !== activeId);
    // Same column: take the over card's slot (moving down lands after it); other column: insert before it
    list.splice(overIndex, 0, active);
  }

  const position = list.indexOf(active);
  if (status === active.status && columns[status].indexOf(active) === position) return null;
  return { status, order: orderBetween(list[position - 1]?.order, list[position + 1]?.order) };
}
