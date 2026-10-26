import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const DATE = '2026-10-26'; // Monday
const NEXT_DATE = '2026-10-27';

async function resetData(request: APIRequestContext) {
  const years: { id: string }[] = await (await request.get('/api/tree')).json();
  for (const y of years) await request.delete(`/api/years/${y.id}`);
}

/** Year → month → week (DATE) with the given tasks on DATE. */
async function seed(request: APIRequestContext, taskTitles: string[], weekStatus = 'todo') {
  const year = await (await request.post('/api/years', { data: { year: 2026, title: '2026 목표' } })).json();
  const month = await (await request.post('/api/months', { data: { yearPlanId: year.id, month: 10, title: '10월 계획' } })).json();
  const week = await (await request.post('/api/weeks', { data: { monthPlanId: month.id, weekStart: DATE, title: '이번 주', status: weekStatus } })).json();
  const tasks = [];
  for (const title of taskTitles) {
    tasks.push(await (await request.post('/api/tasks', { data: { weekPlanId: week.id, date: DATE, title } })).json());
  }
  return { year, month, week, tasks };
}

async function openDate(page: Page, date = DATE) {
  await page.goto('/');
  await page.getByLabel('날짜 선택').fill(date);
  await expect(page.getByRole('heading', { name: `${date} 할 일` })).toBeVisible();
}

// The first day board is the selected date; the second one is the next day
const dayBoard = (page: Page, index = 0) => page.locator('.day-board').nth(index);
const column = (page: Page, label: '예정' | '진행중' | '완료', index = 0) =>
  dayBoard(page, index).getByRole('region', { name: `${label} 컬럼` });
const card = (page: Page, title: string) => page.getByTestId('task-card').filter({ hasText: title });
const progress = (page: Page, label: '일간' | '주간') => page.getByRole('progressbar', { name: `${label} 진행률` });

async function drag(page: Page, source: Locator, target: Locator) {
  // hover() waits until the card has stopped moving (e.g. the previous drop animation)
  await source.hover();
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Pointer sensor needs >5px before the drag starts
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 15 });
  // dnd-kit resolves the drop target on the next frame
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test('목표 수립 flow: 연간 → 월간 → 주간 → 일간 할 일 (AC1, AC5, AC8)', async ({ page }) => {
  await openDate(page);
  await expect(page.getByText('할 일 없음').first()).toBeVisible();

  await page.getByRole('button', { name: '+ 연간 계획' }).click();
  await page.getByLabel('제목').fill('건강한 한 해');
  await page.getByRole('button', { name: '저장' }).click();

  await page.getByRole('button', { name: '건강한 한 해에 월간 계획 추가' }).click();
  await page.getByLabel('월', { exact: true }).selectOption('10');
  await page.getByLabel('제목').fill('10월 운동');
  await page.getByRole('button', { name: '저장' }).click();

  // AC8 (week): a non-Monday start is rejected with a field error
  await page.getByRole('button', { name: '10월 운동에 주간 계획 추가' }).click();
  await page.getByLabel('주 시작일 (월요일)').fill(NEXT_DATE);
  await page.getByLabel('제목').fill('첫째 주');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('주 시작일은 월요일만 선택할 수 있어요')).toBeVisible();
  await page.getByLabel('주 시작일 (월요일)').fill(DATE);
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // AC8 (task): a date outside the week is rejected
  await page.getByRole('button', { name: '첫째 주에 할 일 추가' }).click();
  await page.getByLabel('날짜', { exact: true }).fill('2026-11-05');
  await page.getByLabel('제목').fill('달리기 5km');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('날짜는 주간 계획 기간(2026-10-26 ~ 2026-11-01) 안이어야 해요')).toBeVisible();
  await page.getByLabel('날짜', { exact: true }).fill(DATE);
  await page.getByRole('button', { name: '저장' }).click();

  await expect(column(page, '예정').getByText('달리기 5km')).toBeVisible();
  await expect(progress(page, '일간')).toHaveAttribute('aria-valuenow', '0');
  await expect(progress(page, '주간')).toHaveAttribute('aria-valuenow', '0');

  // Adding from the board uses the week plan of the selected date
  await column(page, '예정').getByRole('button', { name: '+ 할 일' }).click();
  await page.getByLabel('제목').fill('스트레칭');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(column(page, '예정').getByText('스트레칭')).toBeVisible();
});

test('상태 업데이트 flow: 드래그로 예정 → 진행중 → 완료, 새로고침 후 유지 (AC3)', async ({ page, request }) => {
  await seed(request, ['운동하기', '책 읽기']);
  await openDate(page);

  await drag(page, card(page, '운동하기'), column(page, '진행중'));
  await expect(column(page, '진행중').getByText('운동하기')).toBeVisible();
  await expect(card(page, '운동하기')).toHaveAttribute('data-status', 'in_progress');

  const saved = page.waitForResponse((r) => r.url().includes('/api/tasks/') && r.request().method() === 'PATCH');
  await drag(page, card(page, '운동하기'), column(page, '완료'));
  await expect(column(page, '완료').getByText('운동하기')).toBeVisible();
  await expect(progress(page, '일간')).toHaveAttribute('aria-valuenow', '50');
  await expect(progress(page, '주간')).toHaveAttribute('aria-valuenow', '50');

  expect((await saved).status()).toBe(200);
  await page.reload();
  await page.getByLabel('날짜 선택').fill(DATE);
  await expect(column(page, '완료').getByText('운동하기')).toBeVisible();
  await expect(column(page, '예정').getByText('책 읽기')).toBeVisible();
});

test('진행률은 서버 응답 전에 갱신된다 (AC7)', async ({ page, request }) => {
  await seed(request, ['하나', '둘']);
  await openDate(page);

  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let patched = false;
  await page.route('**/api/tasks/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await held;
    patched = true;
    await route.continue();
  });

  await drag(page, card(page, '하나'), column(page, '완료'));
  await expect(progress(page, '일간')).toHaveAttribute('aria-valuenow', '50');
  await expect(progress(page, '주간')).toHaveAttribute('aria-valuenow', '50');
  expect(patched).toBe(false);

  release();
  await expect.poll(() => patched).toBe(true);
  await expect(progress(page, '일간')).toHaveAttribute('aria-valuenow', '50');
});

test('저장 실패 시 카드가 원래 컬럼으로 돌아가고 오류 토스트가 뜬다 (AC10)', async ({ page, request }) => {
  await seed(request, ['실패할 일']);
  await openDate(page);

  await page.route('**/api/tasks/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, json: { error: { code: 'internal_error', message: '서버 오류가 발생했어요' } } })
      : route.continue(),
  );

  await drag(page, card(page, '실패할 일'), column(page, '완료'));
  await expect(page.locator('.toast')).toContainText('할 일을 옮기지 못했어요');
  await expect(column(page, '예정').getByText('실패할 일')).toBeVisible();
  await expect(card(page, '실패할 일')).toHaveAttribute('data-status', 'todo');
});

test('키보드로도 카드를 옮길 수 있다', async ({ page, request }) => {
  await seed(request, ['키보드 할 일']);
  await openDate(page);

  await card(page, '키보드 할 일').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await expect(card(page, '키보드 할 일')).toHaveAttribute('data-status', 'in_progress');
});

test('수정 및 삭제 flow: 진행률 연동과 연쇄 삭제 (AC2, AC9)', async ({ page, request }) => {
  const { tasks } = await seed(request, ['완료된 일', '남은 일']);
  await request.patch(`/api/tasks/${tasks[0].id}`, { data: { status: 'done' } });
  await openDate(page);
  await expect(progress(page, '일간')).toHaveAttribute('aria-valuenow', '50');

  // Edit a task title
  await page.getByRole('button', { name: '남은 일 수정' }).click();
  await page.getByLabel('제목').fill('남은 일 (수정)');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(card(page, '남은 일 (수정)')).toBeVisible();

  // Deleting the done task drops progress to 0
  await page.getByRole('button', { name: '완료된 일 삭제' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
  await expect(card(page, '완료된 일')).toHaveCount(0);
  await expect(progress(page, '일간')).toHaveAttribute('aria-valuenow', '0');

  // Deleting the last task of the day brings back "할 일 없음"
  await page.getByRole('button', { name: '남은 일 (수정) 삭제' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
  await expect(progress(page, '일간')).toHaveCount(0);
  await expect(page.getByText('할 일 없음')).toHaveCount(1);

  // Deleting the year shows the descendant count and removes everything
  await page.getByRole('button', { name: '2026 목표 삭제' }).click();
  await expect(page.getByRole('dialog')).toContainText('하위 항목 2개(월간 1, 주간 1, 할 일 0)');
  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
  await expect(page.getByText('연간 계획을 추가해 시작하세요.')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(0);
  await expect(page.getByText('할 일 없음').first()).toBeVisible();
});

test('일간 보드 위 메뉴로 주간·월간 계획을 펼쳐 본다', async ({ page, request }) => {
  const { tasks } = await seed(request, ['물 마시기', '스트레칭']);
  await request.patch(`/api/tasks/${tasks[0].id}`, { data: { status: 'done' } });
  await openDate(page);

  const weekPanel = page.getByRole('region', { name: '주간 계획 요약' });
  const monthPanel = page.getByRole('region', { name: '월간 계획 요약' });

  await page.getByRole('button', { name: '주간 계획', exact: true }).click();
  await expect(weekPanel).toContainText('이번 주');
  await expect(weekPanel).toContainText('할 일 1/2 · 50%');

  await page.getByRole('button', { name: '월간 계획', exact: true }).click();
  await expect(weekPanel).toBeHidden();
  await expect(monthPanel).toContainText('10월 계획');
  await expect(monthPanel).toContainText('10-26~11-01 · 이번 주');

  // Pressing the active button again closes the panel
  await page.getByRole('button', { name: '월간 계획', exact: true }).click();
  await expect(monthPanel).toBeHidden();
});

test('연간 계획 메뉴와 대시보드 메뉴', async ({ page, request }) => {
  const { tasks } = await seed(request, ['물 마시기', '스트레칭', '독서']);
  await request.patch(`/api/tasks/${tasks[0].id}`, { data: { status: 'done' } });
  await request.patch(`/api/tasks/${tasks[1].id}`, { data: { status: 'in_progress' } });
  await openDate(page);

  await page.getByRole('button', { name: '연간 계획', exact: true }).click();
  const yearPanel = page.getByRole('region', { name: '연간 계획 요약' });
  await expect(yearPanel).toContainText('2026 · 2026 목표');
  await expect(yearPanel).toContainText('10월 · 10월 계획');
  await expect(yearPanel).toContainText('월간 0/1 완료');

  await page.getByRole('button', { name: '대시보드', exact: true }).click();
  await expect(yearPanel).toBeHidden();
  const dashboard = page.getByRole('region', { name: '대시보드' });
  const tile = (label: string) => dashboard.locator('.stat').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
  await expect(tile('전체')).toHaveText('3');
  await expect(tile('예정')).toHaveText('1');
  await expect(tile('진행중')).toHaveText('1');
  await expect(tile('완료')).toHaveText('1');
  await expect(dashboard.getByRole('progressbar', { name: '월 10-26 진행률' })).toHaveAttribute('aria-valuenow', '33');
  await expect(tile('주간 계획 완료')).toHaveText('0/1');
  await expect(tile('등록된 할 일')).toHaveText('3');
});

test('다른 날짜로 할 일을 추가하면 보드가 그 날짜로 이동한다', async ({ page, request }) => {
  await seed(request, []);
  await openDate(page);

  await page.getByRole('button', { name: '이번 주에 할 일 추가' }).click();
  await page.getByLabel('날짜', { exact: true }).fill('2026-10-30');
  await page.getByLabel('제목').fill('금요일 미팅');
  await page.getByRole('button', { name: '저장' }).click();

  await expect(page.getByRole('heading', { name: '2026-10-30 할 일' })).toBeVisible();
  await expect(column(page, '예정').getByText('금요일 미팅')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('2026-10-30 할 일로 이동했어요');
});

test('일간 일정은 선택한 날과 다음 날 보드를 함께 보여준다', async ({ page, request }) => {
  const { week } = await seed(request, ['오늘 할 일']);
  await request.post('/api/tasks', { data: { weekPlanId: week.id, date: NEXT_DATE, title: '내일 할 일' } });
  await openDate(page);

  await expect(dayBoard(page, 0).getByRole('heading', { level: 2 })).toContainText(`${DATE} 할 일`);
  await expect(dayBoard(page, 1).getByRole('heading', { level: 2 })).toContainText(`${NEXT_DATE} 할 일`);
  await expect(column(page, '예정', 0).getByText('오늘 할 일')).toBeVisible();
  await expect(column(page, '예정', 1).getByText('내일 할 일')).toBeVisible();
  await expect(column(page, '예정', 0).getByText('내일 할 일')).toHaveCount(0);

  // A task added for the next day stays put: it is already on screen
  await column(page, '예정', 1).getByRole('button', { name: '+ 할 일' }).click();
  await expect(page.getByLabel('날짜', { exact: true })).toHaveValue(NEXT_DATE);
  await page.getByLabel('제목').fill('내일 추가');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(column(page, '예정', 1).getByText('내일 추가')).toBeVisible();
  await expect(dayBoard(page, 0).getByRole('heading', { level: 2 })).toContainText(`${DATE} 할 일`);

  // Cards on the next-day board can be moved too
  await drag(page, card(page, '내일 할 일'), column(page, '완료', 1));
  await expect(column(page, '완료', 1).getByText('내일 할 일')).toBeVisible();
});

test('일요일의 다음 날은 다음 주 보드에서 불러온다', async ({ page, request }) => {
  const { month } = await seed(request, []);
  const next = await (await request.post('/api/weeks', { data: { monthPlanId: month.id, weekStart: '2026-11-02', title: '다음 주' } })).json();
  await request.post('/api/tasks', { data: { weekPlanId: next.id, date: '2026-11-02', title: '월요일 업무' } });
  await openDate(page, '2026-11-01');
  await expect(column(page, '예정', 1).getByText('월요일 업무')).toBeVisible();
});

test('주간·월간 계획 패널에 기간 안의 일정이 날짜별로 모두 보인다', async ({ page, request }) => {
  const { month, week } = await seed(request, ['월요일 일정']);
  await request.post('/api/tasks', { data: { weekPlanId: week.id, date: '2026-10-30', title: '금요일 미팅' } });
  const nov = await (await request.post('/api/weeks', { data: { monthPlanId: month.id, weekStart: '2026-11-02', title: '11월 첫 주' } })).json();
  await request.post('/api/tasks', { data: { weekPlanId: nov.id, date: '2026-11-03', title: '11월 일정' } });
  const early = await (await request.post('/api/weeks', { data: { monthPlanId: month.id, weekStart: '2026-10-05', title: '10월 첫 주' } })).json();
  await request.post('/api/tasks', { data: { weekPlanId: early.id, date: '2026-10-07', title: '10월 초 일정' } });
  await openDate(page);

  await page.getByRole('button', { name: '주간 계획', exact: true }).click();
  const weekPanel = page.getByRole('region', { name: '주간 계획 요약' });
  await expect(weekPanel).toContainText('이번 주 일정 2개');
  await expect(weekPanel.locator('.agenda-day')).toHaveCount(7);
  await expect(weekPanel.locator('.agenda-day').filter({ hasText: '10-30 (금)' })).toContainText('금요일 미팅');
  await expect(weekPanel).not.toContainText('10월 초 일정');

  await page.getByRole('button', { name: '월간 계획', exact: true }).click();
  const monthPanel = page.getByRole('region', { name: '월간 계획 요약' });
  await expect(monthPanel).toContainText('10월 일정 3개');
  await expect(monthPanel.locator('.agenda-day').filter({ hasText: '10-07 (수)' })).toContainText('10월 초 일정');
  await expect(monthPanel.locator('.agenda-day').filter({ hasText: '10-30 (금)' })).toContainText('금요일 미팅');
  await expect(monthPanel).not.toContainText('11월 일정');

  // Clicking a day in the agenda opens that day on the board
  await monthPanel.getByRole('button', { name: '10-07 (수)' }).click();
  await expect(dayBoard(page, 0).getByRole('heading', { level: 2 })).toContainText('2026-10-07 할 일');
  await expect(column(page, '예정').getByText('10월 초 일정')).toBeVisible();
});

test('일간 일정 메뉴는 열린 패널을 닫고 보드만 보여준다', async ({ page, request }) => {
  await seed(request, ['할 일 하나']);
  await openDate(page);

  const daily = page.getByRole('button', { name: '일간 일정', exact: true });
  await expect(daily).toHaveAttribute('aria-pressed', 'true');
  await expect(daily).toHaveCSS('background-color', 'rgb(255, 169, 77)');
  await expect(page.getByRole('button', { name: '대시보드', exact: true })).toHaveCSS('background-color', 'rgb(255, 224, 194)');
  await expect(daily).toHaveCSS('color', 'rgb(0, 0, 0)');

  await page.getByRole('button', { name: '대시보드', exact: true }).click();
  await expect(daily).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('region', { name: '대시보드' })).toBeVisible();

  await daily.click();
  await expect(page.getByRole('region', { name: '대시보드' })).toBeHidden();
  await expect(daily).toHaveAttribute('aria-pressed', 'true');
  await expect(column(page, '예정').getByText('할 일 하나')).toBeVisible();
});
