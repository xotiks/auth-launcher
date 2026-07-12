// Роуты профиля пользователя
// Получение профиля, смена пароля, смена логина, удаление аккаунта

import { Router } from 'express';
import { profileController } from '../controllers/profile.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { generalRateLimiter } from '../middlewares/security';
import {
  changePasswordSchema,
  changeLoginSchema,
  deleteAccountSchema,
} from '../validators/auth';

const router = Router();

// Все роуты профиля требуют аутентификации

/**
 * GET /api/v1/profile
 * Получение информации о профиле
 */
router.get(
  '/',
  authenticate,
  profileController.getProfile
);

/**
 * PUT /api/v1/profile/password
 * Смена пароля (требуется старый пароль)
 */
router.put(
  '/password',
  authenticate,
  generalRateLimiter,
  validate(changePasswordSchema),
  profileController.changePassword
);

/**
 * PUT /api/v1/profile/login
 * Смена логина (требуется подтверждение паролем)
 */
router.put(
  '/login',
  authenticate,
  generalRateLimiter,
  validate(changeLoginSchema),
  profileController.changeLogin
);

/**
 * DELETE /api/v1/profile/account
 * Удаление аккаунта (мягкое удаление)
 */
router.delete(
  '/account',
  authenticate,
  generalRateLimiter,
  validate(deleteAccountSchema),
  profileController.deleteAccount
);

export default router;