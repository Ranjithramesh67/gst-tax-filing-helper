import { PrismaClient } from '@prisma/client';

const DEFAULT_DB_TIMEOUT_MS = 10000;

export async function assertDatabaseReachable(timeoutMs = DEFAULT_DB_TIMEOUT_MS): Promise<void> {
  const prisma = new PrismaClient();
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      (async () => {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`No response within ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      'E2E tests require a reachable, seeded PostgreSQL database (DATABASE_URL). ' +
        'Ensure PostgreSQL is running and the database has been seeded ' +
        `(npm run db:seed) before running the e2e suite. Connection check failed: ${reason}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
    await prisma.$disconnect().catch(() => undefined);
  }
}
