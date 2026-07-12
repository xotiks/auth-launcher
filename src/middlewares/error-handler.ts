// Глобальный обработчик ошибок
// Перехватывает все ошибки и возвращает единый формат ответа

import { type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

/**
 * Глобальный middleware обработки ошибок
 * Должен быть зарегистрирован после всех роутов
 * Express определяет ошибку по 4 параметрам
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Логируем ошибку
  logger.error(
    {
      err,
      requestId: req.headers['x-request-id'],
      method: req.method,
      url: req.url,
      ip: req.ip,
    },
    'Ошибка обработки запроса'
  );

  // === Обработка известных типов ошибок ===

  // Кастомные ошибки приложения
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: {
        code: err.code,
        details: err.details,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Ошибки валидации Zod
  if (err instanceof ZodError) {
    const details = err.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');

    res.status(400).json({
      success: false,
      message: 'Ошибка валидации данных',
      error: {
        code: 'VALIDATION_ERROR',
        details,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Обработка ошибок JSON парсинга
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      message: 'Неверный формат JSON в теле запроса',
      error: {
        code: 'INVALID_JSON',
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // === Неизвестные ошибки (500) ===
  // В production не показываем детали ошибки
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json({
    success: false,
    message: 'Внутренняя ошибка сервера',
    ...(isDevelopment && {
      error: {
        code: 'INTERNAL_ERROR',
        details: err.message,
      },
    }),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Middleware для обработки 404 (ресурс не найден)
 * Выполняется, если ни один роут не подошёл
 */
export function notFoundHandler(
  req: Request,
  res: Response
): void {
  res.status(404).json({
    success: false,
    message: `Маршрут ${req.method} ${req.path} не найден`,
    error: {
      code: 'NOT_FOUND',
    },
    timestamp: new Date().toISOString(),
  });
}