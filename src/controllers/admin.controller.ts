// Контроллер администратора
// Управление пользователями, баны, история

import { type Request, type Response, type NextFunction } from 'express';
import { userRepository } from '../repositories/user.repository';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import type { AuthenticatedRequest } from '../types';
import { NotFoundError } from '../utils/errors';

export const adminController = {
  /**
   * GET /api/v1/admin/users
   * Список пользователей с пагинацией и фильтрацией
   */
  async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await userRepository.getUsersList(page, limit, { status, search });

      res.status(200).json({
        success: true,
        message: 'Список пользователей получен',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/users/:uuid
   * Информация о пользователе для админа
   */
  async getUserByUuid(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uuid = req.params.uuid as string;
      const user = await userRepository.getAdminInfo(uuid);

      if (!user) {
        throw new NotFoundError('Пользователь не найден');
      }

      res.status(200).json({
        success: true,
        message: 'Информация о пользователе получена',
        data: { user },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/users/:uuid/ban
   * Блокировка пользователя
   */
  async banUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const admin = authReq.user;

      if (!admin) {
        res.status(401).json({
          success: false,
          message: 'Требуется авторизация',
          error: { code: 'AUTHENTICATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const uuid = req.params.uuid as string;
      const { reason, expiresInHours } = req.body;

      const user = await userRepository.findByUuid(uuid);

      if (!user) {
        throw new NotFoundError('Пользователь не найден');
      }

      // Создаём бан
      const ban = await prisma.ban.create({
        data: {
          userId: user.id,
          adminId: admin.id,
          reason: reason ?? 'Нарушение правил',
          expiresAt: expiresInHours
            ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
            : null,
        },
      });

      // Обновляем статус пользователя
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'BANNED' },
      });

      logger.info(
        { adminLogin: admin.login, userLogin: user.login, reason },
        'Пользователь заблокирован'
      );

      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: 'USER_BANNED',
          details: {
            bannedUserId: user.id,
            bannedLogin: user.login,
            reason,
            banId: ban.id,
          },
        },
      });

      res.status(200).json({
        success: true,
        message: 'Пользователь заблокирован',
        data: { ban },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/users/:uuid/unban
   * Разблокировка пользователя
   */
  async unbanUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const admin = authReq.user;

      if (!admin) {
        res.status(401).json({
          success: false,
          message: 'Требуется авторизация',
          error: { code: 'AUTHENTICATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const uuid = req.params.uuid as string;
      const user = await userRepository.findByUuid(uuid);

      if (!user) {
        throw new NotFoundError('Пользователь не найден');
      }

      // Завершаем все активные баны
      await prisma.ban.updateMany({
        where: {
          userId: user.id,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        data: {
          expiresAt: new Date(),
        },
      });

      // Обновляем статус пользователя
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE' },
      });

      logger.info(
        { adminLogin: admin.login, userLogin: user.login },
        'Пользователь разблокирован'
      );

      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: 'USER_UNBANNED',
          details: { unbannedUserId: user.id, unbannedLogin: user.login },
        },
      });

      res.status(200).json({
        success: true,
        message: 'Пользователь разблокирован',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/v1/admin/users/:uuid/role
   * Изменение роли пользователя
   */
  async changeUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const admin = authReq.user;

      if (!admin) {
        res.status(401).json({
          success: false,
          message: 'Требуется авторизация',
          error: { code: 'AUTHENTICATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const uuid = req.params.uuid as string;
      const { roleName } = req.body;

      const user = await userRepository.findByUuid(uuid);

      if (!user) {
        throw new NotFoundError('Пользователь не найден');
      }

      // Ищем новую роль
      const newRole = await prisma.role.findUnique({
        where: { name: roleName },
      });

      if (!newRole) {
        res.status(400).json({
          success: false,
          message: `Роль "${roleName}" не найдена`,
          error: { code: 'VALIDATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Обновляем роль
      await prisma.user.update({
        where: { id: user.id },
        data: { roleId: newRole.id },
      });

      logger.info(
        { adminLogin: admin.login, userLogin: user.login, oldRole: user.role.name, newRole: roleName },
        'Роль пользователя изменена'
      );

      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: 'USER_ROLE_CHANGED',
          details: {
            targetUserId: user.id,
            targetLogin: user.login,
            oldRole: user.role.name,
            newRole: roleName,
          },
        },
      });

      res.status(200).json({
        success: true,
        message: 'Роль пользователя изменена',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/v1/admin/users/:uuid
   * Принудительное удаление пользователя администратором
   */
  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const admin = authReq.user;

      if (!admin) {
        res.status(401).json({
          success: false,
          message: 'Требуется авторизация',
          error: { code: 'AUTHENTICATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const uuid = req.params.uuid as string;
      const user = await userRepository.findByUuid(uuid);

      if (!user) {
        throw new NotFoundError('Пользователь не найден');
      }

      await userRepository.softDelete(user.id);

      logger.info(
        { adminLogin: admin.login, userLogin: user.login },
        'Пользователь удалён администратором'
      );

      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: 'USER_DELETED_BY_ADMIN',
          details: { deletedUserId: user.id, deletedLogin: user.login },
        },
      });

      res.status(200).json({
        success: true,
        message: 'Пользователь удалён',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/users/:uuid/history
   * История входов пользователя
   */
  async getUserHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uuid = req.params.uuid as string;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const user = await userRepository.findByUuid(uuid);

      if (!user) {
        throw new NotFoundError('Пользователь не найден');
      }

      const history = await userRepository.getLoginHistory(user.id, page, limit);

      res.status(200).json({
        success: true,
        message: 'История входов получена',
        data: history,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },
};