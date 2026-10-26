# GitHub OAuth 로그인

할 일 앱은 GitHub 계정으로 로그인해야 쓸 수 있어요. 로그인한 사용자는 자기 계획과 할 일만 보고 고칠 수 있어요.

## 1. GitHub OAuth App 만들기

1. https://github.com/settings/developers 에서 **OAuth Apps → New OAuth App**을 누르세요.
2. 다음 값을 입력하세요.

   | 항목 | 값 (로컬 개발) |
   |---|---|
   | Application name | 아무 이름 (예: `할 일 계획 (local)`) |
   | Homepage URL | `http://localhost:3000` |
   | Authorization callback URL | `http://localhost:3000/auth/github/callback` |

3. **Register application**을 누르면 **Client ID**가 나와요.
4. **Generate a new client secret**을 눌러 **Client secret**을 만드세요. 이 값은 한 번만 보이니 바로 복사해 두세요.

## 2. `.env`에 넣기

`todo/.env`에 다음처럼 넣으세요. 변수 목록은 `todo/.env.example`에도 있어요.

```
GITHUB_CLIENT_ID="복사한 Client ID"
GITHUB_CLIENT_SECRET="복사한 Client secret"
```

- Client secret은 코드나 문서에 적지 말고 `.env`에만 두세요. `.env`는 `.gitignore`에 들어 있어요.
- 앱은 `http://localhost:3000`(포트를 바꿨다면 `http://localhost:<포트>`)으로 여세요. 다른 사이트에서 보낸 요청을 막으려고, 브라우저 주소의 출처가 서버 주소와 다르면 저장·로그아웃이 403으로 거부돼요. `127.0.0.1`이나 LAN IP로 열면 저장되지 않아요.
- 포트를 바꿨다면 OAuth App의 callback URL과 같은 값을 `GITHUB_CALLBACK_URL`에도 넣으세요.
- `.env`를 고친 뒤에는 `npm run dev`를 다시 시작하세요.

## 3. 실행하고 로그인하기

```
npm run db:start     # 터미널 1: MongoDB
npm run db:push      # 처음 한 번: User, Session 컬렉션과 인덱스 만들기
npm run dev          # 터미널 2: 앱
```

http://localhost:3000 을 열면 로그인 화면이 나와요. **GitHub로 로그인**을 누르고 GitHub에서 승인하면 할 일 화면으로 돌아와요.

## 4. 로그인 전에 만든 데이터 옮기기 (한 번만)

로그인 기능을 넣기 전에 만든 계획과 할 일에는 주인이 없어서, 로그인해도 보이지 않아요. 처음 로그인한 뒤 아래 명령을 한 번 실행하면 그 데이터가 내 계정으로 옮겨져요.

```
npm run db:migrate-user -- <내 GitHub 아이디>
```

- 이미 주인이 있는 데이터는 건드리지 않아요. 여러 번 실행해도 결과는 같아요.
- 예시 데이터를 새로 넣고 싶으면 `npm run db:seed`를 실행하세요. 가장 최근에 로그인한 사용자에게 들어가요. 다른 사용자에게 넣으려면 `SEED_USER=<GitHub 아이디>`를 지정하세요.

## 동작 방식

| 경로 | 하는 일 |
|---|---|
| `GET /auth/github` | 임의의 `state`를 쿠키에 저장하고 GitHub 승인 화면으로 보내요 (scope: `read:user`). |
| `GET /auth/github/callback` | `state`를 확인하고, `code`를 access token으로 바꾼 뒤 GitHub 프로필을 가져와요. `username`과 `avatar_url`을 `User`에 저장(같은 GitHub id면 갱신)하고 세션을 만든 뒤 `/`로 보내요. |
| `POST /auth/logout` | DB의 세션 행을 지우고 세션 쿠키도 지운 뒤 `/login`으로 보내요. 예전 쿠키를 다시 보내도 401이에요. |
| `/login` | 로그인 화면이에요. 이미 로그인했으면 `/`로 보내요. |

- **세션:** 쿠키(`todo_session`, HttpOnly, SameSite=Lax, 30일)에는 임의의 토큰을 담아요. DB에는 그 토큰의 SHA-256 해시만 저장해요. 기한이 지난 세션은 쓰는 순간 지워요.
- **접근 제한:** 로그인하지 않고 `/`에 들어오면 `/login`으로 보내요. `/api/*`는 401(`unauthorized`)을 돌려줘요.
- **본인 데이터만:** 모든 계획 행(`YearPlan`, `MonthPlan`, `WeekPlan`, `DailyTask`)에 `userId`가 있어요. API 요청 안에서 `src/lib/db.ts`의 DB 클라이언트가 모든 조회·생성·수정·삭제에 로그인한 사용자의 `userId` 조건을 붙여요. 그래서 다른 사람의 id는 없는 id처럼 404가 나와요. 기존 CRUD 라우트 코드는 바꾸지 않았어요.

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| "GitHub OAuth 설정이 없어요" | `.env`의 `GITHUB_CLIENT_ID`와 `GITHUB_CLIENT_SECRET` 값, 그리고 `npm run dev`를 다시 시작했는지 |
| GitHub에서 "redirect_uri is not associated" | OAuth App의 callback URL이 `http://localhost:3000/auth/github/callback`과 정확히 같은지 |
| 저장이 안 되고 "다른 사이트에서 보낸 요청" 오류가 나요 | 주소창이 `http://localhost:3000`인지 (`127.0.0.1`, LAN IP는 안 돼요) |
| "GitHub에서 사용자 정보를 가져오지 못했어요" | Client secret이 맞는지. 다시 만들었다면 `.env`도 바꿨는지 (서버 로그에 자세한 원인이 나와요) |
| 로그인했는데 예전 할 일이 안 보여요 | 4번의 `npm run db:migrate-user`를 실행했는지 |
