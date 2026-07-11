// Утилиты для TOTP (Time-based One-Time Password)
// Поддержка Google Authenticator, Aegis, Authy

import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { config } from '../config';

/**
 * Настройка TOTP
 * Период: 30 секунд (стандарт)
 * Количество цифр: 6
 * Алгоритм: SHA1 (стандарт)
 */
authenticator.options = {
  step: 30,
  digits: 6,
};

/**
 * Генерация TOTP секрета для нового пользователя
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Создание URL для QR-кода (otpauth://)
 * Этот URL можно передать в Google Authenticator, Aegis, Authy
 */
export function generateTotpAuthUrl(
  secret: string,
  login: string,
  issuer?: string
): string {
  const appIssuer = issuer ?? config.env.TOTP_ISSUER;
  return authenticator.keyuri(login, appIssuer, secret);
}

/**
 * Генерация QR-кода в формате Data URL (base64 PNG)
 */
export async function generateTotpQrCode(authUrl: string): Promise<string> {
  return qrcode.toDataURL(authUrl, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

/**
 * Проверка TOTP кода
 * Использует безопасное сравнение
 */
export function verifyTotpCode(
  token: string,
  secret: string
): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    // В случае ошибки (неверный формат) возвращаем false
    return false;
  }
}

/**
 * Получение данных для ручного ввода
 */
export function getTotpManualEntryKey(secret: string): string {
  return secret;
}

/**
 * Проверка, истекло ли время действия кода
 * (проверяет текущий и предыдущий 30-секундные интервалы)
 */
export function verifyTotpCodeWithWindow(
  token: string,
  secret: string,
  window: number = 1
): boolean {
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
}