// Роуты аутентификации
// Регистрация, вход, обновление токена, выход

import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { authRateLimiter, authSlowDown, registerRateLimiter, checkIpBlock } from '../middlewares/security';
import {
  registerSchema,
  signInSchema,
} from '../validators/auth';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Регистрация нового пользователя
 * Строгий rate limit: 3 в час
 */
router.post(
  '/register',
  registerRateLimiter,
  checkIpBlock,
  validate(registerSchema),
  authController.register
);

/**
 * POST /api/v1/auth/signin
 * Авторизация пользователя
 * Rate limit + slow down для защиты от перебора
 */
router.post(
  '/signin',
  authRateLimiter,
  authSlowDown,
  checkIpBlock,
  validate(signInSchema),
  authController.signIn
);

/**
 * POST /api/v1/auth/refresh
 * Обновление access токена через refresh токен
 */
router.post(
  '/refresh',
  authRateLimiter,
  authController.refresh
);

/**
 * POST /api/v1/auth/logout
 * Выход из системы (отзыв refresh токена)
 * Требует аутентификации
 */
router.post(
  '/logout',
  authenticate,
  authController.logout
);

export default router;