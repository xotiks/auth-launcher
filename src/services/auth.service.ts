// Сервис аутентификации
// Содержит всю бизнес-логику входа, регистрации, проверки прав

import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { userRepository } from '../repositories/user.repository';
import {
  hashPassword,
  verifyPassword,
  hashToken,
} from '../utils/crypto';
import {
  verifyTotpCode,
  generateTotpSecret,
  generateTotpAuthUrl,
  generateTotpQrCode,
} from '../utils/totp';
import { prisma } from '../database/prisma';
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
  AccountLockedError,
  BannedError,
  TotpError,
  NotFoundError,
} from '../utils/errors';

import type {
  AuthResult,
  UserPublic,
  RegisterRequest,
  AuthRequest,
  TotpSetupResult,
  GmlAuthResponse,
} from '../types';

/**
 * Максимальное количество неудачных попыток входа
 * После превышения аккаунт блокируется на время
 */
const MAX_FAILED_ATTEMPTS = 5;

/**
 * Время блокировки аккаунта (в минутах)
 */
const LOCK_DURATION_MINUTES = 15;

/**
 * Количество предыдущих паролей для истории
 * (защита от повторного использования)
 */
const PASSWORD_HISTORY_LIMIT = 5;

/**
 * Интерфейс для payload JWT токена
 */
interface JwtPayload {
  sub: string;
  uuid: string;
  login: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export const authService = {
  /**
   * Регистрация нового пользователя
   * - Проверка уникальности логина
   * - Хеширование пароля Argon2id
   * - Создание пользователя
   */
  async register(data: RegisterRequest): Promise<UserPublic> {
    const { login, password, email } = data;

    // Проверка уникальности логина
    const loginExists = await userRepository.existsByLogin(login);
    if (loginExists) {
      throw new ConflictError('Пользователь с таким логином уже существует');
    }

    // Проверка уникальности email (если указан)
    if (email) {
      const emailExists = await userRepository.existsByEmail(email);
      if (emailExists) {
        throw new ConflictError('Пользователь с таким email уже существует');
      }
    }

    // Получаем роль USER по умолчанию
    const userRole = await prisma.role.findUnique({
      where: { name: 'USER' },
    });

    if (!userRole) {
      throw new ValidationError('Роль USER не найдена в системе');
    }

    // Хешируем пароль
    const passwordHash = await hashPassword(password);

    // Создаём пользователя
    const user = await userRepository.create({
      login,
      passwordHash,
      email,
      roleId: userRole.id,
    });

    logger.info(
      { login: user.login, uuid: user.uuid },
      'Зарегистрирован новый пользователь'
    );

    // Логируем в аудит
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTERED',
        details: { login: user.login },
      },
    });

    return {
      uuid: user.uuid,
      login: user.login,
      email: user.email,
      status: user.status as UserPublic['status'],
      roleName: userRole.name,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      lastLauncherVersion: user.lastLauncherVersion,
      totpEnabled: user.totpEnabled,
    };
  },

  /**
   * Авторизация пользователя
   * - Поиск пользователя
   * - Проверка статуса (бан, удаление, блокировка)
   * - Проверка пароля
   * - Проверка 2FA
   * - Создание токенов
   * - Запись в историю входов
   */
  async signIn(
    data: AuthRequest,
    ip: string,
    userAgent?: string
  ): Promise<AuthResult> {
    const { login, password, totpCode } = data;

    // Поиск пользователя (регистронезависимый)
    const user = await userRepository.findByLogin(login);

    // Единое сообщение для любого типа ошибки (защита от перебора)
    const authErrorMessage = 'Неверный логин или пароль';

    // Если пользователь не найден — единая ошибка
    if (!user) {
      await userRepository.createLoginHistory({
        ip,
        userAgent,
        success: false,
        failureReason: 'Пользователь не найден',
      });

      logger.warn({ login, ip }, 'Попытка входа с несуществующим логином');
      throw new AuthenticationError(authErrorMessage);
    }

    // Проверка на мягкое удаление
    if (user.deletedAt) {
      throw new AuthenticationError(authErrorMessage);
    }

    // Проверка блокировки аккаунта из-за множества неудачных попыток
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000
      );

      logger.warn(
        { login: user.login, lockedUntil: user.lockedUntil },
        'Попытка входа в заблокированный аккаунт'
      );

      throw new AccountLockedError(
        `Аккаунт заблокирован. Попробуйте через ${remainingMinutes} минут`
      );
    }

    // Сбрасываем блокировку, если время истекло
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      await userRepository.update(user.id, {
        lockedUntil: null,
        failedLoginAttempts: 0,
      });
    }

    // Проверка статуса
    if (user.status === 'BANNED') {
      // Проверяем активные баны
      const activeBan = await prisma.ban.findFirst({
        where: {
          userId: user.id,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });

      const banMessage = activeBan?.reason
        ? `Пользователь заблокирован. Причина: ${activeBan.reason}`
        : 'Пользователь заблокирован';

      await userRepository.createLoginHistory({
        userId: user.id,
        ip,
        userAgent,
        success: false,
        failureReason: 'Пользователь заблокирован',
      });

      logger.warn(
        { login: user.login, banReason: activeBan?.reason },
        'Попытка входа заблокированного пользователя'
      );

      throw new BannedError(banMessage);
    }

    // Проверка пароля (Argon2id)
    const isPasswordValid = await verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      // Увеличиваем счётчик неудачных попыток
      const newAttempts = user.failedLoginAttempts + 1;

      // Если превышен лимит — блокируем аккаунт
      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        await userRepository.update(user.id, {
          failedLoginAttempts: newAttempts,
          lockedUntil: new Date(
            Date.now() + LOCK_DURATION_MINUTES * 60 * 1000
          ),
        });

        logger.warn(
          { login: user.login, attempts: newAttempts, ip },
          'Аккаунт заблокирован из-за множества неудачных попыток'
        );
      } else {
        await userRepository.update(user.id, {
          failedLoginAttempts: newAttempts,
        });
      }

      // Логируем неудачную попытку
      await userRepository.createLoginHistory({
        userId: user.id,
        ip,
        userAgent,
        success: false,
        failureReason: 'Неверный пароль',
      });

      logger.warn(
        { login: user.login, ip, attempt: newAttempts },
        'Неудачная попытка входа'
      );

      throw new AuthenticationError(authErrorMessage);
    }

    // Сбрасываем счётчик неудачных попыток
    await userRepository.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    // Проверка 2FA
    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        // Если 2FA включена, но код не предоставлен — запрашиваем
        throw new TotpError('Требуется код двухфакторной аутентификации');
      }

      const isTotpValid = verifyTotpCode(totpCode, user.totpSecret);

      if (!isTotpValid) {
        await userRepository.createLoginHistory({
          userId: user.id,
          ip,
          userAgent,
          success: false,
          failureReason: 'Неверный TOTP код',
        });

        logger.warn(
          { login: user.login, ip },
          'Неверный код двухфакторной аутентификации'
        );

        throw new TotpError('Неверный код двухфакторной аутентификации');
      }
    }

    // Обновляем информацию о последнем входе
    await userRepository.update(user.id, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      lastLauncherVersion: userAgent,
    });

    // Создаём токены
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Сохраняем refresh токен
    const refreshTokenHash = hashToken(refreshToken);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 дней
      },
    });

    // Логируем успешный вход
    await userRepository.createLoginHistory({
      userId: user.id,
      ip,
      userAgent,
      success: true,
    });

    // Логируем в аудит
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        details: { ip, userAgent },
        ip,
      },
    });

    logger.info({ login: user.login, ip }, 'Успешный вход');

    return {
      user: {
        uuid: user.uuid,
        login: user.login,
        email: user.email,
        status: user.status as UserPublic['status'],
        roleName: user.role.name,
        createdAt: user.createdAt,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        lastLauncherVersion: userAgent ?? null,
        totpEnabled: user.totpEnabled,
      },
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 минут
    };
  },

  /**
   * Обновление access токена с помощью refresh токена
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthResult> {
    const tokenHash = hashToken(refreshToken);

    // Ищем refresh токен в БД
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { role: true },
        },
      },
    });

    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
      throw new AuthenticationError('Недействительный refresh токен');
    }

    // Отзываем старый refresh токен
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    // Создаём новые токены
    const newAccessToken = this.generateAccessToken(storedToken.user);
    const newRefreshToken = this.generateRefreshToken(storedToken.user);

    // Сохраняем новый refresh токен
    const newRefreshTokenHash = hashToken(newRefreshToken);
    await prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        tokenHash: newRefreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      user: {
        uuid: storedToken.user.uuid,
        login: storedToken.user.login,
        email: storedToken.user.email,
        status: storedToken.user.status as UserPublic['status'],
        roleName: storedToken.user.role.name,
        createdAt: storedToken.user.createdAt,
        lastLoginAt: storedToken.user.lastLoginAt,
        lastLoginIp: storedToken.user.lastLoginIp,
        lastLauncherVersion: storedToken.user.lastLauncherVersion,
        totpEnabled: storedToken.user.totpEnabled,
      },
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  },

  /**
   * Выход из системы (отзыв refresh токена)
   */
  async logout(refreshToken: string, userId: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);

    await prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        userId,
        revoked: false,
      },
      data: {
        revoked: true,
      },
    });

    // Удаляем все сессии пользователя
    await prisma.session.deleteMany({
      where: { userId },
    });

    // Логируем выход из системы
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LOGOUT',
      },
    });
  },

  /**
   * Смена пароля
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    // Проверяем старый пароль
    const isOldPasswordValid = await verifyPassword(
      oldPassword,
      user.passwordHash
    );

    if (!isOldPasswordValid) {
      throw new AuthenticationError('Неверный текущий пароль');
    }

    // Проверяем, не использовался ли уже этот пароль
    const passwordHistory = await prisma.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_LIMIT,
    });

    for (const historyEntry of passwordHistory) {
      const isReused = await verifyPassword(
        newPassword,
        historyEntry.passwordHash
      );
      if (isReused) {
        throw new ValidationError(
          'Этот пароль уже использовался ранее. Пожалуйста, выберите другой пароль.'
        );
      }
    }

    // Хешируем новый пароль
    const newPasswordHash = await hashPassword(newPassword);

    // Сохраняем старый пароль в историю
    await prisma.passwordHistory.create({
      data: {
        userId: user.id,
        passwordHash: user.passwordHash,
      },
    });

    // Обновляем пароль
    await userRepository.update(user.id, {
      passwordHash: newPasswordHash,
    });

    // Отзываем все refresh токены пользователя (кроме текущей сессии)
    await prisma.refreshToken.updateMany({
      where: {
        userId: user.id,
        revoked: false,
      },
      data: {
        revoked: true,
      },
    });

    logger.info({ login: user.login }, 'Пароль успешно изменён');

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_CHANGED',
      },
    });
  },

  /**
   * Смена логина
   */
  async changeLogin(
    userId: string,
    newLogin: string,
    password: string
  ): Promise<UserPublic> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    // Проверяем пароль
    const isPasswordValid = await verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AuthenticationError('Неверный пароль');
    }

    // Проверяем уникальность нового логина
    const loginExists = await userRepository.existsByLogin(newLogin);
    if (loginExists) {
      throw new ConflictError('Пользователь с таким логином уже существует');
    }

    // Обновляем логин
    const updatedUser = await userRepository.update(user.id, {
      login: newLogin,
    });

    logger.info(
      { oldLogin: user.login, newLogin, userId: user.id },
      'Логин успешно изменён'
    );

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_CHANGED',
        details: { oldLogin: user.login, newLogin },
      },
    });

    return {
      uuid: updatedUser.uuid,
      login: updatedUser.login,
      email: updatedUser.email,
      status: updatedUser.status as UserPublic['status'],
      roleName: user.role.name,
      createdAt: updatedUser.createdAt,
      lastLoginAt: updatedUser.lastLoginAt,
      lastLoginIp: updatedUser.lastLoginIp,
      lastLauncherVersion: updatedUser.lastLauncherVersion,
      totpEnabled: updatedUser.totpEnabled,
    };
  },

  /**
   * Мягкое удаление аккаунта
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    // Проверяем пароль
    const isPasswordValid = await verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AuthenticationError('Неверный пароль');
    }

    await userRepository.softDelete(userId);

    logger.info({ login: user.login, userId }, 'Аккаунт удалён');

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'ACCOUNT_DELETED',
      },
    });
  },

  /**
   * Настройка TOTP (2FA)
   */
  async setupTotp(
    userId: string,
    password: string
  ): Promise<TotpSetupResult> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    // Проверяем пароль
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Неверный пароль');
    }

    // Если 2FA уже включена — возвращаем ошибку
    if (user.totpEnabled) {
      throw new ValidationError('Двухфакторная аутентификация уже включена');
    }

    // Генерируем TOTP секрет
    const secret = generateTotpSecret();
    const authUrl = generateTotpAuthUrl(secret, user.login);
    const qrCode = await generateTotpQrCode(authUrl);

    // Сохраняем секрет временно (до подтверждения)
    await userRepository.update(user.id, { totpSecret: secret });

    return {
      secret,
      qrCodeDataUrl: qrCode,
      manualEntryKey: secret,
    };
  },

  /**
   * Подтверждение и включение TOTP
   */
  async verifyAndEnableTotp(
    userId: string,
    code: string,
    secret: string
  ): Promise<void> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    // Проверяем код
    if (!verifyTotpCode(code, secret)) {
      throw new TotpError('Неверный код подтверждения');
    }

    // Включаем 2FA
    await userRepository.update(user.id, {
      totpEnabled: true,
      totpSecret: secret,
    });

    logger.info(
      { login: user.login },
      'Двухфакторная аутентификация включена'
    );

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'TOTP_ENABLED',
      },
    });
  },

  /**
   * Отключение TOTP
   */
  async disableTotp(
    userId: string,
    code: string,
    password: string
  ): Promise<void> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    // Проверяем пароль
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Неверный пароль');
    }

    // Если 2FA не включена — ошибка
    if (!user.totpEnabled || !user.totpSecret) {
      throw new ValidationError('Двухфакторная аутентификация не включена');
    }

    // Проверяем код
    if (!verifyTotpCode(code, user.totpSecret)) {
      throw new TotpError('Неверный код');
    }

    // Отключаем 2FA
    await userRepository.update(user.id, {
      totpEnabled: false,
      totpSecret: null,
    });

    logger.info(
      { login: user.login },
      'Двухфакторная аутентификация отключена'
    );

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'TOTP_DISABLED',
      },
    });
  },

  /**
   * Генерация access JWT токена
   */
  generateAccessToken(user: {
    id: string;
    uuid: string;
    login: string;
    role: { id: string; name: string; permissions: unknown };
  }): string {
    const payload: JwtPayload = {
      sub: user.id,
      uuid: user.uuid,
      login: user.login,
      roleId: user.role.id,
      roleName: user.role.name,
      permissions: Array.isArray(user.role.permissions)
        ? (user.role.permissions as string[])
        : [],
    };

    const signOptions: SignOptions = {
      expiresIn: config.jwtOptions.accessExpiresIn as string & SignOptions['expiresIn'],
    };
    return jwt.sign(payload, config.jwtOptions.accessSecret, signOptions);
  },

  /**
   * Генерация refresh JWT токена
   */
  generateRefreshToken(user: {
    id: string;
    uuid: string;
    login: string;
  }): string {
    const payload = {
      sub: user.id,
      uuid: user.uuid,
      login: user.login,
      type: 'refresh',
    };

    const signOptions: SignOptions = {
      expiresIn: config.jwtOptions.refreshExpiresIn as string & SignOptions['expiresIn'],
    };
    return jwt.sign(payload, config.jwtOptions.refreshSecret, signOptions);
  },

  /**
   * Преобразование результата авторизации в формат GML
   */
  toGmlResponse(authResult: AuthResult): GmlAuthResponse {
    return {
      Login: authResult.user.login,
      UserUuid: authResult.user.uuid,
      Message: 'Успешная авторизация',
    };
  },
};