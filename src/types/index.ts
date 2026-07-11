// Базовые типы и интерфейсы для всего приложения

import { type Request, type Response, type NextFunction } from 'express';

// === Общие типы ответа API ===

/**
 * Единый формат ответа API
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    details?: string;
  };
  timestamp: string;
}

/**
 * Пагинированный ответ
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// === Типы пользователя ===

/**
 * Статус пользователя
 */
export type UserStatus = 'ACTIVE' | 'BANNED' | 'SUSPENDED' | 'DELETED';

/**
 * Публичная информация о пользователе (без секретов)
 */
export interface UserPublic {
  uuid: string;
  login: string;
  email?: string | null;
  status: UserStatus;
  roleName: string;
  createdAt: Date;
  lastLoginAt?: Date | null;
  lastLoginIp?: string | null;
  lastLauncherVersion?: string | null;
  totpEnabled: boolean;
}

/**
 * Информация о пользователе для админа (с дополнительными данными)
 */
export interface UserAdmin extends UserPublic {
  id: string;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  updatedAt: Date;
  deletedAt?: Date | null;
  bans: BanInfo[];
}

/**
 * Краткая информация о пользователе для GML
 */
export interface UserGmlInfo {
  uuid: string;
  login: string;
}

// === Типы аутентификации ===

/**
 * Входные данные для авторизации (GML формат)
 */
export interface AuthGmlRequest {
  Login: string;
  Password: string;
  Totp?: string;
}

/**
 * Входные данные для авторизации (внутренний формат)
 */
export interface AuthRequest {
  login: string;
  password: string;
  totpCode?: string;
}

/**
 * Результат авторизации
 */
export interface AuthResult {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Ответ для GML
 */
export interface GmlAuthResponse {
  Login: string;
  UserUuid: string;
  Message: string;
}

/**
 * Данные для регистрации
 */
export interface RegisterRequest {
  login: string;
  password: string;
  email?: string;
}

/**
 * Данные для смены пароля
 */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

/**
 * Данные для смены логина
 */
export interface ChangeLoginRequest {
  newLogin: string;
  password: string;
}

// === Типы 2FA / TOTP ===

export interface TotpSetupResult {
  secret: string;
  qrCodeDataUrl: string;
  manualEntryKey: string;
}

export interface TotpVerifyRequest {
  code: string;
  secret?: string;
}

// === Типы администрирования ===

export interface BanInfo {
  id: string;
  reason?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
  adminLogin: string;
}

export interface AdminActionRequest {
  reason?: string;
  expiresInHours?: number;
}

export interface RoleUpdateRequest {
  roleName: string;
}

// === Типы истории входов ===

export interface LoginHistoryEntry {
  id: string;
  ip: string;
  userAgent?: string | null;
  country?: string | null;
  success: boolean;
  failureReason?: string | null;
  createdAt: Date;
}

// === Типы аудита ===

export interface AuditLogEntry {
  id: string;
  userId?: string | null;
  action: string;
  details?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: Date;
}

// === Типы для Express ===

/**
 * Расширенный Request с данными пользователя
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    uuid: string;
    login: string;
    roleName: string;
    roleId: string;
    permissions: string[];
  };
}

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;