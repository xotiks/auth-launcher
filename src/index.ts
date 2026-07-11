// Точка входа в приложение
// Загрузка переменных окружения, подключение к БД, запуск сервера

import 'dotenv/config'; // Загрузка .env файла
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './database/prisma';

/**
 * Запуск сервера
 */
async function bootstrap(): Promise<void> {
  try {
    // Подключаемся к базе данных
    await connectDatabase();

    // Создаём Express приложение
    const app = createApp();

    // Запускаем HTTP сервер
    const server = app.listen(config.env.PORT, config.env.HOST, () => {
      logger.info(
        {
          port: config.env.PORT,
          host: config.env.HOST,
          environment: config.env.NODE_ENV,
        },
        `🚀 Сервер запущен на http://${config.env.HOST}:${config.env.PORT}`
      );
      logger.info(`📖 API документация: http://${config.env.HOST}:${config.env.PORT}/api/v1/health`);
    });

    // === Graceful Shutdown ===
    // Корректное завершение работы при получении сигналов

    const shutdown = async (signal: string) => {
      logger.info(`Получен сигнал ${signal}. Начинаю graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP сервер остановлен');

        await disconnectDatabase();

        logger.info('Приложение завершило работу');
        process.exit(0);
      });

      // Принудительное завершение через 30 секунд
      setTimeout(() => {
        logger.error('Принудительное завершение после таймаута');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Обработка необработанных rejections
    process.on('unhandledRejection', (reason: Error | unknown) => {
      logger.error(
        { error: reason instanceof Error ? reason.message : String(reason) },
        'Необработанный rejection'
      );
    });

    // Обработка необработанных исключений
    process.on('uncaughtException', (error: Error) => {
      logger.fatal({ error: error.message, stack: error.stack }, 'Необработанное исключение');
      process.exit(1);
    });
  } catch (error) {
    logger.fatal({ error }, 'Критическая ошибка при запуске приложения');
    process.exit(1);
  }
}

bootstrap();