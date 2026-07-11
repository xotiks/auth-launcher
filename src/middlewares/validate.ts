// Middleware валидации запросов с помощью Zod
// Автоматически проверяет body, query, params

import { type Request, type Response, type NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Middleware для валидации запроса по Zod схеме
 * @param schema - Zod схема для валидации
 * @param target - что валидировать: body, query или params
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[target]);
      // Заменяем исходные данные на валидированные (с дефолтными значениями)
      req[target] = data;
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const details = error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ');

        _res.status(400).json({
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
      next(error);
    }
  };
}