// Контроллер GML интеграции
// Принимает запросы от GML лаунчера, возвращает ответ в GML формате

import { type Request, type Response, type NextFunction } from 'express';
import { gmlAdapter } from '../integrations/gml/gml.adapter';

export const gmlController = {
  /**
   * POST /api/v1/integrations/auth/signin
   * Основной эндпоинт для GML лаунчера
   * Принимает { Login, Password, Totp } и возвращает { Login, UserUuid, Message }
   */
  async signIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const userAgent = req.headers['user-agent'];

      const { Login, Password, Totp } = req.body;

      // Проверка обязательных полей (быстрая, без Zod)
      if (!Login || !Password) {
        res.status(400).json({
          Login: '',
          UserUuid: '',
          Message: 'Login и Password обязательны',
        });
        return;
      }

      const result = await gmlAdapter.processGmlAuth(
        { Login, Password, Totp },
        ip,
        userAgent
      );

      res.status(result.statusCode).json(result.body);
    } catch (error) {
      // На случай необработанных ошибок — возвращаем GML формат
      res.status(500).json({
        Login: '',
        UserUuid: '',
        Message: 'Внутренняя ошибка сервера',
      });
    }
  },
};