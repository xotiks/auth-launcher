// Классы ошибок для единообразной обработки ошибок в приложении

/**
 * Базовый класс для всех кастомных ошибок приложения
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: string,
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Сохраняем стек вызовов, но не для всех типов ошибок
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Ошибка валидации входных данных (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: string) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Ошибка аутентификации (401)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Неверный логин или пароль', details?: string) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

/**
 * Ошибка доступа — недостаточно прав (403)
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Доступ запрещён', details?: string) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

/**
 * Ресурс не найден (404)
 */
export class NotFoundError extends AppError {
  constructor(message = 'Ресурс не найден', details?: string) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

/**
 * Конфликт — ресурс уже существует (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: string) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * Слишком много запросов (429)
 */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Слишком много запросов. Пожалуйста, попробуйте позже') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}

/**
 * Аккаунт заблокирован (423)
 */
export class AccountLockedError extends AppError {
  constructor(message = 'Аккаунт временно заблокирован из-за множества неудачных попыток') {
    super(message, 423, 'ACCOUNT_LOCKED');
  }
}

/**
 * Пользователь заблокирован (403)
 */
export class BannedError extends AppError {
  constructor(message = 'Пользователь заблокирован', details?: string) {
    super(message, 403, 'BANNED', details);
  }
}

/**
 * Ошибка двухфакторной аутентификации (401)
 */
export class TotpError extends AppError {
  constructor(message = 'Неверный код двухфакторной аутентификации') {
    super(message, 401, 'TOTP_ERROR');
  }
}

/**
 * Внутренняя ошибка сервера (500)
 */
export class InternalError extends AppError {
  constructor(message = 'Внутренняя ошибка сервера', details?: string) {
    super(message, 500, 'INTERNAL_ERROR', details, false);
  }
}