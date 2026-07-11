// Middleware безопасности
// Rate limiting, slow down, защита от перебора, проверка IP блокировок

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { type Request, type Response, type NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';
import { TooManyRequestsError } from '../utils/errors';

/**
 * Общий rate limiter для всех API запросов
 */
export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimitOptions.windowMs,
  max: config.rateLimitOptions.maxGeneral,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, _res: Response) => {
    throw new TooManyRequestsError();
  },
});

/**
 * Строгий rate limiter для эндпоинтов аутентификации
 * Защита от перебора паролей
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimitOptions.windowMs,
  max: config.rateLimitOptions.maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Не считаем успешные входы
  handler: (_req: Request, _res: Response) => {
    throw new TooManyRequestsError();
  },
});

/**
 * Slow down для auth запросов
 * После 3 попыток добавляет задержку, увеличивая её с каждой попыткой
 */
export const authSlowDown = slowDown({
  windowMs: config.rateLimitOptions.windowMs,
  delayAfter: 3,
  delayMs: (hits: number) => hits * 500, // 500ms за каждую попытку после 3-й
  maxDelayMs: 10000, // Максимальная задержка 10 секунд
  skipSuccessfulRequests: true,
});

/**
 * Очень строгий rate limiter для регистрации
 * Защита от создания множества аккаунтов (боты)
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 3, // максимум 3 регистрации с одного IP в час
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, _res: Response) => {
    throw new TooManyRequestsError(
      'Слишком много попыток регистрации. Попробуйте через час.'
    );
  },
});

/**
 * Middleware для проверки блокировки IP
 * Проверяет, не заблокирован ли IP адрес в базе данных
 */
export async function checkIpBlock(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    // Проверяем, есть ли IP в блокировках
    const ipBlock = await prisma.ipBlock.findUnique({
      where: { ip },
    });

    if (ipBlock) {
      // Проверяем, не истекла ли блокировка
      if (ipBlock.expiresAt && ipBlock.expiresAt < new Date()) {
        // Блокировка истекла — удаляем и пропускаем
        await prisma.ipBlock.delete({ where: { id: ipBlock.id } });
        return next();
      }

      logger.warn(
        { ip, reason: ipBlock.reason },
        'Заблокированный IP пытается выполнить запрос'
      );

      throw new TooManyRequestsError(
        'Ваш IP адрес временно заблокирован из-за подозрительной активности'
      );
    }

    next();
  } catch (error) {
    if (error instanceof TooManyRequestsError) {
      throw error;
    }
    // Логируем ошибку, но пропускаем запрос (не блокируем из-за ошибки БД)
    logger.error({ error }, 'Ошибка при проверке блокировки IP');
    next();
  }
}

/**
 * Middleware для ограничения размера body
 * Используется для разных эндпоинтов
 */
export function bodySizeLimit(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);

    if (contentLength > maxBytes) {
      res.status(413).json({
        success: false,
        message: 'Размер тела запроса превышает допустимый лимит',
        error: { code: 'PAYLOAD_TOO_LARGE' },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/**
 * Добавление security headers через helmet уже настроено в app.ts
 * Дополнительные заголовки для специфических эндпоинтов
 */
export function additionalSecurityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // Запрещаем кэширование для API запросов
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Запрещаем отображение страницы в iframe (защита от clickjacking)
  res.setHeader('X-Frame-Options', 'DENY');

  // Включает XSS фильтр в браузерах
  res.setHeader('X-XSS-Protection', '1; mode=block');

  next();
}