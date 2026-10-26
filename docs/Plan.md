# Plan — 계층형 할 일 관리 웹앱 (P0)

> 상태: **pending approval** (승인 전 구현 시작하지 않음)
> 근거 문서: `docs/PRD.md`
> 작성일: 2026-10-26

## 1. 요구사항 요약

| 항목 | 결정 |
|---|---|
| 형태 | 웹앱 + 백엔드 DB, 내 PC에서 실행 (2026-10-26부터 GitHub 로그인 — 11장 참고) |
| 기술 스택 | Next.js (App Router) + TypeScript, Prisma + **MongoDB** (`.env`의 `MONGODB_URI`, 2026-10-26 SQLite에서 변경 — 11장 참고) |
| 클라이언트 | TanStack Query (조회 캐시 + 낙관적 업데이트), D&D `@dnd-kit/core`·`@dnd-kit/sortable`, 입력 검증 `zod` |
| 테스트 | Vitest (도메인 로직, API), Playwright (E2E) |
| 범위 | **이번 계획: P0** (계층 CRUD, 칸반 D&D, 일간/주간 진행률). P1(뷰 전환, 이월, 롤업)은 Phase 2로 분리 |
| 주간 진행률 | 주간 계획별 하위 할 일 완료율의 **평균**. 하위 할 일이 없는 주간 계획은 자기 상태로 계산(완료=100%, 그 외=0%) |
| 주 시작 요일 | 월요일 (ISO 주) |

PRD의 주간 진행률 공식("완료 배점 / 전체 계획 수")은 분자·분모 기준이 달라 100%를 넘을 수 있어서, 위의 평균 방식으로 확정했어요.

## 2. 데이터 모델 (`prisma/schema.prisma`)

```prisma
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }   // file:./dev.db

model YearPlan {
  id        String      @id @default(cuid())
  userId    String      @default("local")   // 나중에 로그인 추가 대비
  year      Int
  title     String
  status    String      @default("todo")    // todo | in_progress | done (zod로 검증)
  createdAt DateTime    @default(now())
  months    MonthPlan[]
}

model MonthPlan {
  id         String     @id @default(cuid())
  yearPlanId String
  yearPlan   YearPlan   @relation(fields: [yearPlanId], references: [id], onDelete: Cascade)
  month      Int        // 1-12
  title      String
  status     String     @default("todo")
  createdAt  DateTime   @default(now())
  weeks      WeekPlan[]
}

model WeekPlan {
  id          String      @id @default(cuid())
  monthPlanId String
  monthPlan   MonthPlan   @relation(fields: [monthPlanId], references: [id], onDelete: Cascade)
  weekStart   String      // YYYY-MM-DD, 월요일
  title       String
  status      String      @default("todo")
  createdAt   DateTime    @default(now())
  tasks       DailyTask[]
  @@index([weekStart])
}

model DailyTask {
  id         String   @id @default(cuid())
  weekPlanId String
  weekPlan   WeekPlan @relation(fields: [weekPlanId], references: [id], onDelete: Cascade)
  date       String   // YYYY-MM-DD
  title      String
  status     String   @default("todo")
  order      Float    // 컬럼 안 순서. 사이에 끼울 때 (앞+뒤)/2 → 다른 행 재정렬 불필요
  createdAt  DateTime @default(now())
  @@index([date])
}
```

- 관계: Year 1:N Month 1:N Week 1:N DailyTask. 부모 삭제 시 DB의 `onDelete: Cascade`로 하위 항목 자동 삭제
- 날짜는 `YYYY-MM-DD` 문자열로 저장 (시간대 변환으로 하루 밀리는 문제 방지)
- `status`는 SQLite 호환을 위해 문자열로 두고, API 입력 단계에서 zod로 세 값만 허용
- 검증 규칙 (zod, `src/domain/validation.ts`)
  - MonthPlan.month는 1~12
  - WeekPlan.weekStart는 월요일
  - DailyTask.date는 부모 WeekPlan의 `weekStart ~ weekStart+6일` 범위 안

## 3. API (Route Handlers, `src/app/api/`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/tree` | 전체 계층(연→월→주) + 하위 개수. 1인용이라 데이터가 작아 한 번에 조회 |
| GET | `/api/tasks?weekStart=YYYY-MM-DD` | 해당 주의 WeekPlan과 DailyTask 전부 (진행률 계산용) |
| POST | `/api/years`, `/api/months`, `/api/weeks`, `/api/tasks` | 생성. 부모 id 필수, 없는 부모면 404 |
| PATCH | `/api/{years\|months\|weeks\|tasks}/[id]` | 수정. 할 일은 `status`, `order` 변경도 여기서 |
| DELETE | `/api/{years\|months\|weeks\|tasks}/[id]` | 삭제 (하위 연쇄 삭제) |
| GET | `/api/{years\|months\|weeks}/[id]/descendants` | 삭제 확인 창에 보여줄 하위 항목 수 |

- 오류 응답 형식: `{ error: { code, message, fields? } }`, 검증 실패는 400, 없는 항목은 404
- Prisma 클라이언트는 `src/lib/db.ts`에서 싱글턴으로 생성 (Next 개발 서버 재시작마다 연결이 늘어나는 문제 방지)

## 4. 진행률 계산 규칙 (`src/domain/progress.ts`, 순수 함수)

- **일간 진행률(date)** = 해당 날짜 DailyTask 중 `done` 수 / 해당 날짜 DailyTask 수 × 100
  - 할 일이 없으면 `null` → UI에 "할 일 없음" 표시 (0%로 표시하지 않음)
- **주간 진행률(weekStart)** = 해당 주 WeekPlan들의 개별 진행률 평균 × 100
  - 개별 진행률 = 하위 DailyTask가 있으면 `done 수 / 전체 수`, 없으면 `status === 'done' ? 1 : 0`
  - 해당 주에 WeekPlan이 없으면 `null`
- 표시는 반올림 정수 (66.67 → 67%)
- 진행률은 DB에 저장하지 않고, 클라이언트가 `/api/tasks?weekStart=` 결과로 계산 → 낙관적 업데이트 직후 바로 갱신됨

## 5. 화면 구성

```
┌─────────────────────────────────────────────────────────┐
│ 헤더: 날짜 선택(◀ 오늘 ▶)   일간 ███████░░░ 70%  주간 █████░░░░░ 50% │
├──────────────────┬──────────────────────────────────────┤
│ 계획 트리         │ 칸반 보드 (선택한 날짜의 일간 할 일)          │
│ ▸ 2026 연간 목표   │  예정        │  진행중      │  완료        │
│   ▸ 10월 계획     │  [카드]      │  [카드]      │  [카드]      │
│     ▸ 10/26 주   │  [+ 할 일]   │              │              │
│ [+ 연간 계획]     │                                        │
└──────────────────┴──────────────────────────────────────┘
```

- 왼쪽: 계층 트리. 항목마다 하위 추가/수정/삭제 버튼
- 오른쪽: 선택한 날짜의 칸반 보드. 다른 컬럼으로 드래그하면 상태 변경, 같은 컬럼 안에서는 순서 변경
- D&D 흐름: 드롭 즉시 화면 반영(낙관적) → `PATCH /api/tasks/[id]` → 실패하면 원래 위치로 되돌리고 오류 토스트
- 키보드 접근성: dnd-kit KeyboardSensor (스페이스로 잡고 방향키로 이동)

## 6. 구현 단계

파일 경로는 `todo/` 기준이에요.

### Step 1. 프로젝트 초기화
- `npx create-next-app@latest . --ts --app --src-dir --eslint`, 의존성: `prisma`, `@prisma/client`, `zod`, `@tanstack/react-query`, `@dnd-kit/core`, `@dnd-kit/sortable`, `vitest`, `@playwright/test`
- `.env`에 `DATABASE_URL="file:./dev.db"`, `.gitignore`에 `prisma/dev.db*` 추가
- 완료 기준: `npm run dev`로 기본 페이지가 뜨고 `npm test`가 통과

### Step 2. DB 스키마
- `prisma/schema.prisma` (2장), `npx prisma migrate dev --name init`
- `prisma/seed.ts` — 샘플 데이터 (연 1, 월 1, 주 1, 할 일 5)
- 완료 기준: 마이그레이션 성공, `npx prisma studio`에서 시드 데이터 확인

### Step 3. 도메인 로직 (UI·DB와 분리된 순수 함수)
- `src/domain/types.ts`, `dates.ts`(`isMonday`, `weekRange`, `isDateInWeek`), `progress.ts`, `validation.ts`(zod 스키마), `ordering.ts`(`orderBetween(prev, next)`)
- 완료 기준: `src/domain/*.test.ts` 통과 (7장 AC4~AC6, AC9 포함)

### Step 4. API
- `src/lib/db.ts`, `src/app/api/**/route.ts` (3장 표)
- 테스트는 별도 DB 파일(`DATABASE_URL=file:./test.db`)을 쓰고 테스트마다 초기화
- 완료 기준: `src/app/api/**/*.test.ts` 통과 — 생성/수정/삭제, 연쇄 삭제, 잘못된 입력 400, 없는 부모 404

### Step 5. 계획 트리 + CRUD UI
- `src/components/PlanTree.tsx`, `PlanForm.tsx`(생성/수정 공용 모달), `ConfirmDialog.tsx`
- `src/lib/queries.ts` — TanStack Query 훅 (`useTree`, `useWeek`, 생성/수정/삭제 mutation)
- 폼 오류는 필드 아래에 표시 (예: "월요일만 선택할 수 있어요")
- 완료 기준: 연→월→주→일 할 일까지 화면에서 생성·수정·삭제 가능, 삭제 확인 창에 하위 항목 수 표시

### Step 6. 칸반 보드 + D&D
- `src/components/KanbanBoard.tsx`, `KanbanColumn.tsx`, `TaskCard.tsx`
- `useMoveTask` mutation: `onMutate`에서 캐시 갱신, `onError`에서 롤백
- 완료 기준: 카드를 다른 컬럼으로 옮기면 상태가 바뀌고 새로고침 후에도 유지됨. API 실패 시 원래 위치로 돌아감

### Step 7. 진행률 표시
- `src/components/ProgressBar.tsx` (`role="progressbar"`, `aria-valuenow`)
- 헤더에 선택 날짜의 일간 진행률, 그 날짜가 속한 주의 주간 진행률
- 완료 기준: 카드를 완료로 옮기면 서버 응답을 기다리지 않고 두 진행률이 갱신됨

### Step 8. E2E 테스트와 마무리
- `e2e/flow.spec.ts` — PRD의 User Flow 3가지 시나리오 (테스트용 DB 사용)
- 완료 기준: `npx playwright test` 통과

## 7. 수용 기준 (테스트 가능)

| # | 기준 | 검증 방법 |
|---|---|---|
| AC1 | 연간 → 월간 → 주간 → 일간 순서로 생성할 수 있고, 부모 id 없이 하위 항목 생성 요청 시 400, 없는 부모 id면 404 | API 테스트 + E2E |
| AC2 | 부모 삭제 시 모든 하위 항목이 DB에서 삭제되고, 확인 창에 정확한 수가 표시됨 | API 테스트 (연 1, 월 2, 주 3, 할 일 5 → descendants 10, 삭제 후 전 테이블 0행) |
| AC3 | 카드를 예정 → 진행중 → 완료로 드래그하면 DB 상태가 바뀌고 새로고침 후에도 유지됨 | E2E |
| AC4 | 일간 진행률: 할 일 3개 중 2개 완료 → 67% | 단위 테스트 |
| AC5 | 일간 진행률: 할 일 0개 → `null`, 화면에 "할 일 없음" | 단위 + E2E |
| AC6 | 주간 진행률: 계획 A(할 일 4개 중 2개 완료 = 50%) + 계획 B(할 일 없음, 상태 완료 = 100%) → 75% | 단위 테스트 |
| AC7 | 카드 상태 변경 직후(서버 응답 전) 일간·주간 진행률 바가 갱신됨 | E2E (API 응답 지연을 걸어 확인) |
| AC8 | 할 일 날짜가 부모 주 범위를 벗어나면 API가 400을 반환하고 폼에 오류 문구가 표시됨 | API 테스트 + E2E |
| AC9 | 완료된 할 일 삭제·수정 후 진행률이 다시 계산됨 | 단위 테스트 |
| AC10 | D&D 중 API가 실패하면 카드가 원래 컬럼으로 돌아가고 오류 토스트가 뜸 | E2E (API 500 응답 모킹) |

## 8. 위험 요소와 대응

| 위험 | 대응 |
|---|---|
| DB 파일 손상·삭제로 데이터 유실 | `prisma/dev.db`를 주기적으로 복사하도록 README에 안내. Phase 2에 JSON 내보내기 추가 |
| 날짜/시간대 오류 (UTC 변환으로 하루 밀림) | 날짜는 문자열로만 저장·비교. `Date` 생성은 `dates.ts` 헬퍼에서만, 경계값 테스트 포함 |
| 주가 두 달에 걸침 (예: 9/29~10/5) | 주간 계획은 사용자가 고른 월간 계획에 속함. 날짜 검증은 주 범위만 확인 |
| 낙관적 업데이트와 서버 상태 불일치 | mutation 완료 후 `invalidateQueries`로 재조회, 실패 시 롤백 (AC10) |
| SQLite 외래키 연쇄 삭제 미동작 | Prisma가 SQLite에서 외래키를 켜는지 AC2 테스트로 직접 확인 |
| Windows에서 Prisma 엔진·파일 잠금 문제 | 개발 서버를 끈 뒤 마이그레이션 실행. 테스트 DB는 테스트 실행마다 새 파일 사용 |
| 드래그가 모바일·키보드에서 안 됨 | dnd-kit Pointer + Touch + Keyboard 센서 모두 등록 |

## 9. 검증 절차

1. `npm test` — 도메인·API 테스트 전부 통과 (AC1, AC2, AC4~AC6, AC8, AC9)
2. `npx playwright test` — E2E 통과 (AC1, AC3, AC5, AC7, AC8, AC10)
3. `npm run build` — 타입 오류 없이 빌드 성공
4. 직접 확인: `npm run dev` → 연간 계획부터 할 일까지 만들고, 카드를 완료로 옮겨 진행률이 바뀌는지, 서버를 재시작해도 데이터가 남는지 확인

## 10. Phase 2 (P1, 이번 범위 밖)

- 기간별 뷰 전환 (Calendar / List / Board), 일·주·월·년 필터
- 미완료 할 일 이월 (자동/수동)
- 월간·연간 진행률 롤업 (주간 진행률 평균 방식 확장)
- JSON 내보내기/가져오기 (데이터 백업)
- 로그인 추가 시 `userId` 컬럼 활용

## 11. 변경 이력

### 2026-10-26 — DB를 SQLite에서 MongoDB로 변경
- `prisma/schema.prisma`: provider `mongodb`, url `env("MONGODB_URI")`. id와 부모 참조 필드는 `@db.ObjectId`. 2장의 SQLite 스키마 예시는 이 파일로 대체돼요
- MongoDB에는 외래키가 없어서 `onDelete: Cascade`는 Prisma가 클라이언트에서 흉내 내요. 이 때문에 MongoDB는 **replica set**으로 실행돼야 해요
- 마이그레이션(`prisma migrate`) 대신 `npx prisma db push`로 컬렉션과 인덱스를 만들어요
- 로컬 개발: `npm run db:start`가 27017 포트에 1노드 replica set을 띄우고 데이터를 `.mongo-data/`에 저장해요 (mongodb-memory-server-core 사용, 시스템 설치 불필요)
- 테스트: Vitest는 27117, Playwright는 27118 포트에 임시 MongoDB를 띄워요
- 형식이 잘못된 id(ObjectId가 아님)는 404로 응답해요
- 위험 요소 표의 SQLite 관련 항목(DB 파일, 외래키)은 `.mongo-data/` 백업과 Prisma 연쇄 삭제 테스트(AC2)로 대체돼요


### 2026-10-26 — GitHub OAuth 로그인 추가 (자세한 설정은 `docs/LOGIN.md`)
- 1장의 "로그인 없음"은 이 변경으로 대체돼요. 로그인한 사용자마다 자기 계획만 봐요
- 스키마: `User`(githubId, username, avatarUrl)와 `Session`(토큰의 SHA-256 해시, 만료 시각)을 추가했어요. `YearPlan`·`MonthPlan`·`WeekPlan`·`DailyTask` 모두에 `userId`와 인덱스가 있어요. 기본값 `""`는 요청 밖에서 만든 행이라는 뜻이고, 어떤 사용자에게도 보이지 않아요
- 라우트: `GET /auth/github`, `GET /auth/github/callback`, `POST /auth/logout`, `/login` 화면
- 접근 제한: `handle()`(`src/lib/api.ts`)이 세션을 확인하고, 없으면 401을 돌려줘요. `/`는 로그인 화면으로 보내요
- 본인 데이터만: `src/lib/db.ts`의 Prisma 확장이 요청 안의 모든 계획 쿼리에 `userId` 조건을 붙여요. 기존 CRUD 라우트 코드는 그대로예요
- 데이터 마이그레이션: `npm run db:migrate-user -- <GitHub 아이디>`가 로그인 전 데이터(`userId`가 없거나 `"local"`)를 그 사용자에게 연결해요
- 테스트: `src/app/auth/auth.test.ts`(GitHub 응답은 모의), `e2e/auth.spec.ts`. E2E 서버는 테스트 DB에 테스트 사용자와 세션을 미리 넣어 두고 시작해요
