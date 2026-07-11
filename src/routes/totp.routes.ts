// Роуты двухфакторной аутентификации (TOTP)
// Настройка, подтверждение, отключение 2FA

import { Router } from 'express';
import { totpController } from '../controllers/totp.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { authRateLimiter } from '../middlewares/security';
import {
  setup2faSchema,
  verify2faSchema,
  disable2faSchema,
} from '../validators/auth';

const router = Router();

// Все роуты 2FA требуют аутентификации

/**
 * POST /api/v1/2fa/setup
 * Настройка TOTP (получение секрета и QR-кода)
 */
router.post(
  '/setup',
  authenticate,
  authRateLimiter,
  validate(setup2faSchema),
  totpController.setup
);

/**
 * POST /api/v1/2fa/verify
 * Подтверждение TOTP и включение 2FA
 */
router.post(
  '/verify',
  authenticate,
  authRateLimiter,
  validate(verify2faSchema),
  totpController.verify
);

/**
 * POST /api/v1/2fa/disable
 * Отключение 2FA
 */
router.post(
  '/disable',
  authenticate,
  authRateLimiter,
  validate(disable2faSchema),
  totpController.disable
);

export default router;