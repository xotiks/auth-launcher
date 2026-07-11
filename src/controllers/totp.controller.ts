// Контроллер двухфакторной аутентификации (TOTP)
// Настройка, подтверждение и отключение 2FA

import { type Request, type Response, type NextFunction } from 'express';
import { authService } from '../services/auth.service';
import type { AuthenticatedRequest } from '../types';

export const totpController = {
  /**
   * POST /api/v1/2fa/setup
   * Настройка TOTP (получение секрета и QR-кода)
   */
  async setup(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      if (!password) {
        res.status(400).json({
          success: false,
          message: 'Пароль обязателен',
          error: { code: 'VALIDATION_ERROR' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await authService.setupTotp(user.id, password);

      res.status(200).json({
        success: true,
        message: 'TOTP настроен. Подтвердите код для включения.',
        data: {
          secret: result.secret,
          qrCode: result.qrCodeDataUrl,
          manualEntryKey: result.manualEntryKey,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/2fa/verify
   * Подтверждение TOTP и включение 2FA
   */
  async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const { code, secret } = req.body;

      await authService.verifyAndEnableTotp(user.id, code, secret);

      res.status(200).json({
        success: true,
        message: 'Двухфакторная аутентификация успешно включена',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/2fa/disable
   * Отключение 2FA
   */
  async disable(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const { code, password } = req.body;

      await authService.disableTotp(user.id, code, password);

      res.status(200).json({
        success: true,
        message: 'Двухфакторная аутентификация отключена',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },
};