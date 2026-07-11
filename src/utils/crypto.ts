// Криптографические утилиты
// Функции для безопасного сравнения строк, генерации случайных значений и т.д.

import * as crypto from 'crypto';
import argon2 from 'argon2';
import { config } from '../config';

/**
 * Настройки Argon2id для хеширования паролей
 */
const argon2Options: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: config.argon2Options.memoryCost,
  timeCost: config.argon2Options.timeCost,
  parallelism: config.argon2Options.parallelism,
  hashLength: config.argon2Options.hashLength,
};

/**
 * Хеширование пароля с использованием Argon2id
 * Argon2id — самый безопасный на сегодняшний день алгоритм хеширования паролей
 * Устойчив к GPU-атакам и ASIC-атакам
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, argon2Options);
}

/**
 * Проверка пароля против хеша Argon2id
 * Использует безопасное сравнение внутри argon2
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password, argon2Options);
  } catch {
    // В случае любой ошибки возвращаем false (защита от timing attack)
    return false;
  }
}

/**
 * Безопасное сравнение строк (защита от Timing Attack)
 * Используется для сравнения токенов, кодов 2FA и т.д.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Сравниваем с самим собой, чтобы сохранить константное время
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Генерация криптостойкого случайного токена
 * Используется для refresh токенов, сессий, подтверждения email и т.д.
 */
export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Создание SHA-256 хеша строки
 * Используется для хеширования токенов перед сохранением в БД
 * (сами токены в БД не храним, только их хеши)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Генерация случайного кода подтверждения (например для email)
 */
export function generateVerificationCode(length: number = 6): string {
  const digits = '0123456789';
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += digits[bytes[i]! % digits.length];
  }
  return code;
}

/**
 * Генерация случайного пароля
 */
export function generateRandomPassword(length: number = 24): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let password = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i]! % chars.length];
  }
  return password;
}