// Prisma клиент — единственный экземпляр для всего приложения
// Использует паттерн Singleton для предотвращения множественных подключений

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * Создание Prisma клиента с настройками логирования
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  // Логирование запросов в development режиме
  if (process.env.NODE_ENV === 'development') {
    client.$on('query', (e: { query: string; params: string; duration: number }) => {
      logger.debug({ query: e.query, params: e.params, duration: e.duration }, 'SQL Query');
    });
  }

  // Логирование ошибок базы данных
  client.$on('error', (e: { message: string }) => {
    logger.error({ error: e.message }, 'Prisma error');
  });

  return client;
}

// Глобальный экземпляр для предотвращения множественных подключений
// в режиме hot-reload (development)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Подключение к базе данных с повторными попытками
 */
export async function connectDatabase(): Promise<void> {
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      logger.info('Подключение к базе данных успешно установлено');
      return;
    } catch (error) {
      logger.error(
        { attempt, maxRetries: MAX_RETRIES, error },
        'Ошибка подключения к базе данных'
      );

      if (attempt === MAX_RETRIES) {
        logger.fatal('Не удалось подключиться к базе данных после всех попыток');
        process.exit(1);
      }

      logger.info(`Повторная попытка через ${RETRY_DELAY_MS / 1000} секунд...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

/**
 * Отключение от базы данных (при graceful shutdown)
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Отключение от базы данных выполнено');
  } catch (error) {
    logger.error({ error }, 'Ошибка при отключении от базы данных');
  }
}