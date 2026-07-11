// Middleware аутентификации и авторизации
// Проверка JWT токенов, прав доступа

import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import { type AuthenticatedRequest } from '../types';
import { AuthenticationError, ForbiddenError } from '../utils/errors';

/**
 * Интерфейс payload JWT токена
 */
interface JwtPayload {
  sub: string;       // ID пользователя
  uuid: string;      // UUID пользователя
  login: string;     // Логин
  roleId: string;    // ID роли
  roleName: string;  // Название роли
  permissions: string[]; // Права
}

/**
 * Middleware проверки access токена
 * Добавляет данные пользователя в req.user
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Требуется авторизация');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new AuthenticationError('Требуется авторизация');
    }

    // Верифицируем токен
    const decoded = jwt.verify(
      token,
      config.jwtOptions.accessSecret
    ) as JwtPayload;

    // Добавляем данные пользователя в запрос
    (req as AuthenticatedRequest).user = {
      id: decoded.sub,
      uuid: decoded.uuid,
      login: decoded.login,
      roleName: decoded.roleName,
      roleId: decoded.roleId,
      permissions: decoded.permissions,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Срок действия токена истёк');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Недействительный токен');
    }
    throw error;
  }
}

/**
 * Middleware проверки прав доступа
 * Принимает название права, которое должно быть у пользователя
 */
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authenticatedReq = req as AuthenticatedRequest;
    const user = authenticatedReq.user;

    if (!user) {
      throw new AuthenticationError('Требуется авторизация');
    }

    // Администратор имеет все права
    if (user.roleName === 'ADMIN') {
      return next();
    }

    if (!user.permissions.includes(permission)) {
      logger.warn(
        { login: user.login, requiredPermission: permission },
        'Попытка доступа без необходимых прав'
      );
      throw new ForbiddenError('Недостаточно прав для выполнения действия');
    }

    next();
  };
}

/**
 * Middleware проверки роли
 * Принимает название роли
 */
export function requireRole(roleName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authenticatedReq = req as AuthenticatedRequest;
    const user = authenticatedReq.user;

    if (!user) {
      throw new AuthenticationError('Требуется авторизация');
    }

    if (user.roleName !== roleName && user.roleName !== 'ADMIN') {
      logger.warn(
        { login: user.login, requiredRole: roleName, userRole: user.roleName },
        'Попытка доступа без необходимой роли'
      );
      throw new ForbiddenError('Недостаточно прав для выполнения действия');
    }

    next();
  };
}

/**
 * Опциональная аутентификация
 * Если токен есть — проверяем, если нет — пропускаем
 * Используется для эндпоинтов, где аутентификация не обязательна
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(
      token,
      config.jwtOptions.accessSecret
    ) as JwtPayload;

    (req as AuthenticatedRequest).user = {
      id: decoded.sub,
      uuid: decoded.uuid,
      login: decoded.login,
      roleName: decoded.roleName,
      roleId: decoded.roleId,
      permissions: decoded.permissions,
    };

    next();
  } catch {
    // Игнорируем ошибки токена при опциональной аутентификации
    next();
  }
}