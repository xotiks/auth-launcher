// GML Integration Adapter
// Адаптер для преобразования запросов/ответов между GML Launcher и внутренним API
// Если GML изменит формат — меняем только этот файл

import { authService } from '../../services/auth.service';
import { logger } from '../../utils/logger';
import type {
  AuthGmlRequest,
  GmlAuthResponse,
  AuthResult,
} from '../../types';

/**
 * Адаптер для интеграции с GML Launcher
 *
 * GML отправляет:
 *   POST /api/v1/integrations/auth/signin
 *   Body: { Login, Password, Totp }
 *
 * GML ожидает ответ:
 *   { Login, UserUuid, Message }
 *   Статусы: 200 — успех, 401 — неверные данные, 403 — заблокирован
 */
export const gmlAdapter = {
  /**
   * Преобразование запроса от GML во внутренний формат
   */
  toInternalRequest(gmlRequest: AuthGmlRequest): {
    login: string;
    password: string;
    totpCode?: string;
  } {
    return {
      login: gmlRequest.Login,
      password: gmlRequest.Password,
      totpCode: gmlRequest.Totp,
    };
  },

  /**
   * Преобразование внутреннего результата в формат GML
   */
  toGmlResponse(authResult: AuthResult): GmlAuthResponse {
    return {
      Login: authResult.user.login,
      UserUuid: authResult.user.uuid,
      Message: 'Успешная авторизация',
    };
  },

  /**
   * Формирование ответа об ошибке для GML
   */
  toGmlErrorResponse(statusCode: number, message: string): {
    statusCode: number;
    body: GmlAuthResponse;
  } {
    return {
      statusCode,
      body: {
        Login: '',
        UserUuid: '',
        Message: message,
      },
    };
  },

  /**
   * Полный процесс авторизации GML
   * Принимает запрос от GML, обрабатывает, возвращает ответ в формате GML
   */
  async processGmlAuth(
    gmlRequest: AuthGmlRequest,
    ip: string,
    userAgent?: string
  ): Promise<{ statusCode: number; body: Partial<GmlAuthResponse> | Record<string, unknown> }> {
    try {
      // Преобразуем запрос GML во внутренний формат
      const internalRequest = this.toInternalRequest(gmlRequest);

      // Выполняем авторизацию
      const authResult = await authService.signIn(
        internalRequest,
        ip,
        userAgent
      );

      // Преобразуем внутренний ответ в формат GML
      const gmlResponse = this.toGmlResponse(authResult);

      logger.info(
        { login: gmlRequest.Login, ip },
        'Успешная GML авторизация'
      );

      return {
        statusCode: 200,
        body: gmlResponse,
      };
    } catch (error) {
      // Преобразуем ошибку в GML формат
      const typedError = error as { statusCode?: number; message?: string };
      const statusCode = typedError.statusCode ?? 401;
      const message = typedError.message ?? 'Ошибка авторизации';

      logger.warn(
        { login: gmlRequest.Login, ip, error: message },
        'Ошибка GML авторизации'
      );

      const errorResponse = this.toGmlErrorResponse(statusCode, message);

      return {
        statusCode: errorResponse.statusCode,
        body: errorResponse.body,
      };
    }
  },
};