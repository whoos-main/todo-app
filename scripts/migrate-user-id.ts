// One-off data migration: give plan rows created before login existed to a GitHub user.
//   npm run db:migrate-user -- <github-username>
// The user must have signed in once so their User row exists. Rows that already
// belong to a user are left alone; running it twice changes nothing.
import { PrismaClient } from '@prisma/client';

const COLLECTIONS = ['YearPlan', 'MonthPlan', 'WeekPlan', 'DailyTask'];
// Before login: YearPlan had userId "local"; the other levels had no userId at all
const UNOWNED = { $or: [{ userId: { $exists: false } }, { userId: 'local' }, { userId: '' }] };

const db = new PrismaClient();

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('사용법: npm run db:migrate-user -- <GitHub 아이디>');
  // GitHub usernames can be renamed and reused, so refuse to guess between two accounts
  const users = await db.user.findMany({ where: { username } });
  if (users.length === 0) throw new Error(`"${username}" 사용자가 없어요. 먼저 앱에서 GitHub로 한 번 로그인해 주세요.`);
  if (users.length > 1) {
    throw new Error(`"${username}" 사용자가 ${users.length}명이에요 (GitHub id: ${users.map((u) => u.githubId).join(', ')}). 자동으로 고를 수 없어요.`);
  }
  const [user] = users;

  for (const collection of COLLECTIONS) {
    const result = (await db.$runCommandRaw({
      update: collection,
      updates: [{ q: UNOWNED, u: { $set: { userId: user.id } }, multi: true }],
    })) as { nModified?: number };
    console.log(`${collection}: ${result.nModified ?? 0}개를 ${username}에게 연결`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await db.$disconnect();
    process.exit(1);
  });
