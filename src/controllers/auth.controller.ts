// Контроллер аутентификации
// Тонкий слой — только вызов сервисов и формирование HTTP ответа

import { type Request, type Response, type NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { logger } from '../utils/logger';
import type { AuthenticatedRequest } from '../types';

export const authController = {
  /**
   * POST /api/v1/auth/register
   * Регистрация нового пользователя
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.register(req.body);
      res.status(201).json({
        success: true,
        message: 'Регистрация прошла успешно',
        data: { user },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/auth/signin
   * Авторизация пользователя (внутренний API)
   */
  async signIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const userAgent = req.headers['user-agent'];

      const result = await authService.signIn(
        {
          login: req.body.login,
          password: req.body.password,
          totpCode: req.body.totpCode,
        },
        ip,
        userAgent
      );

      res.status(200).json({
        success: true,
        message: 'Авторизация прошла успешно',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/auth/refresh
   * Обновление access токена
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          message: 'Refresh token обязателен',
          error: { code: 'VALIDATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await authService.refreshAccessToken(refreshToken);

      res.status(200).json({
        success: true,
        message: 'Токен обновлён',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/auth/logout
   * Выход из системы
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { refreshToken } = req.body;

      if (!authReq.user) {
        res.status(401).json({
          success: false,
          message: 'Требуется авторизация',
          error: { code: 'AUTHENTICATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await authService.logout(refreshToken ?? '', authReq.user.id);

      res.status(200).json({
        success: true,
        message: 'Выход из системы выполнен',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },
};