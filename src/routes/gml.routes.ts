// Роуты GML интеграции
// Эндпоинт для GML лаунчера

import { Router } from 'express';
import { gmlController } from '../controllers/gml.controller';
import { validate } from '../middlewares/validate';
import { authRateLimiter, authSlowDown, checkIpBlock } from '../middlewares/security';
import { gmlAuthSchema } from '../validators/auth';

const router = Router();

/**
 * POST /api/v1/integrations/auth/signin
 * Основной эндпоинт для GML лаунчера
 * Принимает { Login, Password, Totp } в формате GML
 * Возвращает { Login, UserUuid, Message } в формате GML
 */
router.post(
  '/auth/signin',
  authRateLimiter,
  authSlowDown,
  checkIpBlock,
  validate(gmlAuthSchema),
  gmlController.signIn
);

export default router;