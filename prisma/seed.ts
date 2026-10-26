import { PrismaClient } from '@prisma/client';
import { toISODate, startOfWeek, addDays } from '../src/domain/dates';

const db = new PrismaClient();

async function main() {
  // Sample data goes to a signed-in user: SEED_USER (GitHub username) or the most recent one
  const username = process.env.SEED_USER;
  const user = await db.user.findFirst({ where: username ? { username } : {}, orderBy: { createdAt: 'desc' } });
  if (!user) throw new Error('사용자가 없어요. 먼저 앱에서 GitHub로 한 번 로그인한 뒤 다시 실행해 주세요.');
  const userId = user.id;

  // Children first: MongoDB has no foreign keys to cascade a bulk delete
  await db.dailyTask.deleteMany({ where: { userId } });
  await db.weekPlan.deleteMany({ where: { userId } });
  await db.monthPlan.deleteMany({ where: { userId } });
  await db.yearPlan.deleteMany({ where: { userId } });

  const today = toISODate(new Date());
  const weekStart = startOfWeek(today);
  const [year, month] = today.split('-').map(Number);

  await db.yearPlan.create({
    data: {
      userId,
      year,
      title: `${year} 연간 목표`,
      months: {
        create: {
          userId,
          month,
          title: `${month}월 계획`,
          weeks: {
            create: {
              userId,
              weekStart,
              title: `${weekStart} 주간 계획`,
              tasks: {
                create: [
                  { userId, date: today, title: '운동 30분', status: 'done', order: 1 },
                  { userId, date: today, title: '책 20쪽 읽기', status: 'in_progress', order: 2 },
                  { userId, date: today, title: '이메일 정리', status: 'todo', order: 3 },
                  { userId, date: today, title: '주간 회고 작성', status: 'todo', order: 4 },
                  { userId, date: addDays(today, 1), title: '장보기', status: 'todo', order: 1 },
                ],
              },
            },
          },
        },
      },
    },
  });
  console.log(`${user.username}에게 예시 데이터를 넣었어요`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
