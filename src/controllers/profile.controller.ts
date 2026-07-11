// Контроллер профиля пользователя
// Получение информации, смена пароля, смена логина, удаление аккаунта

import { type Request, type Response, type NextFunction } from 'express';
import { userRepository } from '../repositories/user.repository';
import { authService } from '../services/auth.service';
import type { AuthenticatedRequest } from '../types';

export const profileController = {
  /**
   * GET /api/v1/profile
   * Получение информации о профиле
   */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Требуется авторизация',
          error: { code: 'AUTHENTICATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const profile = await userRepository.getPublicInfo(user.uuid);

      if (!profile) {
        res.status(404).json({
          success: false,
          message: 'Пользователь не найден',
          error: { code: 'NOT_FOUND' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Информация о профиле получена',
        data: { profile },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/v1/profile/password
   * Смена пароля
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Требуется авторизация',
          error: { code: 'AUTHENTICATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { oldPassword, newPassword } = req.body;

      await authService.changePassword(user.id, oldPassword, newPassword);

      res.status(200).json({
        success: true,
        message: 'Пароль успешно изменён',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/v1/profile/login
   * Смена логина
   */
  async changeLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Требуется авторизация',
          error: { code: 'AUTHENTICATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { newLogin, password } = req.body;

      const updatedUser = await authService.changeLogin(user.id, newLogin, password);

      res.status(200).json({
        success: true,
        message: 'Логин успешно изменён',
        data: { user: updatedUser },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/v1/profile/account
   * Удаление аккаунта (мягкое удаление)
   */
  async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Требуется авторизация',
          error: { code: 'AUTHENTICATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { password } = req.body;

      await authService.deleteAccount(user.id, password);

      res.status(200).json({
        success: true,
        message: 'Аккаунт успешно удалён',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },
};