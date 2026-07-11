// Роуты администратора
// Управление пользователями, баны, история

import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authenticate, requireRole } from '../middlewares/auth';
import { generalRateLimiter } from '../middlewares/security';

const router = Router();

// Все роуты админа требуют аутентификации и роли ADMIN

/**
 * GET /api/v1/admin/users
 * Список пользователей (с пагинацией и фильтрацией)
 */
router.get(
  '/users',
  authenticate,
  requireRole('ADMIN'),
  adminController.getUsers
);

/**
 * GET /api/v1/admin/users/:uuid
 * Информация о пользователе для админа
 */
router.get(
  '/users/:uuid',
  authenticate,
  requireRole('ADMIN'),
  adminController.getUserByUuid
);

/**
 * POST /api/v1/admin/users/:uuid/ban
 * Блокировка пользователя
 */
router.post(
  '/users/:uuid/ban',
  authenticate,
  requireRole('ADMIN'),
  generalRateLimiter,
  adminController.banUser
);

/**
 * POST /api/v1/admin/users/:uuid/unban
 * Разблокировка пользователя
 */
router.post(
  '/users/:uuid/unban',
  authenticate,
  requireRole('ADMIN'),
  adminController.unbanUser
);

/**
 * PUT /api/v1/admin/users/:uuid/role
 * Изменение роли пользователя
 */
router.put(
  '/users/:uuid/role',
  authenticate,
  requireRole('ADMIN'),
  generalRateLimiter,
  adminController.changeUserRole
);

/**
 * DELETE /api/v1/admin/users/:uuid
 * Удаление пользователя администратором
 */
router.delete(
  '/users/:uuid',
  authenticate,
  requireRole('ADMIN'),
  adminController.deleteUser
);

/**
 * GET /api/v1/admin/users/:uuid/history
 * История входов пользователя
 */
router.get(
  '/users/:uuid/history',
  authenticate,
  requireRole('ADMIN'),
  adminController.getUserHistory
);

export default router;