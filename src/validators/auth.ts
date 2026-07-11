// Валидаторы для эндпоинтов аутентификации
// Используют Zod для проверки всех входных данных

import { z } from 'zod';

/**
 * Правила валидации логина
 * - Длина от 3 до 32 символов
 * - Только латинские буквы, цифры, нижнее подчёркивание и дефис
 * - Не начинается с цифры или спецсимвола
 */
const loginSchema = z
  .string()
  .min(3, 'Логин должен содержать минимум 3 символа')
  .max(32, 'Логин должен содержать максимум 32 символа')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    'Логин может содержать только латинские буквы, цифры, _ и -'
  )
  .refine((val) => !val.startsWith('-') && !val.startsWith('_'), {
    message: 'Логин не может начинаться с "-" или "_"',
  });

/**
 * Правила валидации пароля
 * - Длина от 8 до 128 символов
 * - Минимум одна заглавная буква
 * - Минимум одна строчная буква
 * - Минимум одна цифра
 * - Минимум один спецсимвол
 */
const passwordSchema = z
  .string()
  .min(8, 'Пароль должен содержать минимум 8 символов')
  .max(128, 'Пароль должен содержать максимум 128 символов')
  .regex(/[A-Z]/, 'Пароль должен содержать минимум одну заглавную букву')
  .regex(/[a-z]/, 'Пароль должен содержать минимум одну строчную букву')
  .regex(/[0-9]/, 'Пароль должен содержать минимум одну цифру')
  .regex(
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
    'Пароль должен содержать минимум один спецсимвол'
  );

/**
 * Валидация TOTP кода
 * - 6 цифр
 */
const totpCodeSchema = z
  .string()
  .length(6, 'Код 2FA должен содержать ровно 6 цифр')
  .regex(/^\d{6}$/, 'Код 2FA должен состоять только из цифр');

/**
 * Схема валидации запроса на регистрацию
 */
export const registerSchema = z.object({
  login: loginSchema,
  password: passwordSchema,
  email: z.string().email('Неверный формат email').optional(),
});

/**
 * Схема валидации запроса на авторизацию (внутренний API)
 */
export const signInSchema = z.object({
  login: z.string().min(1, 'Логин обязателен'),
  password: z.string().min(1, 'Пароль обязателен'),
  totpCode: totpCodeSchema.optional(),
});

/**
 * Схема валидации запроса от GML
 * Поля Login, Password — обязательные, Totp — опциональный
 */
export const gmlAuthSchema = z.object({
  Login: z.string().min(1, 'Login обязателен'),
  Password: z.string().min(1, 'Password обязателен'),
  Totp: z.string().optional(),
});

/**
 * Схема валидации смены пароля
 */
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Старый пароль обязателен'),
  newPassword: passwordSchema,
}).refine(
  (data) => data.oldPassword !== data.newPassword,
  {
    message: 'Новый пароль должен отличаться от старого',
    path: ['newPassword'],
  }
);

/**
 * Схема валидации смены логина
 */
export const changeLoginSchema = z.object({
  newLogin: loginSchema,
  password: z.string().min(1, 'Пароль обязателен для подтверждения'),
});

/**
 * Схема запроса восстановления пароля
 */
export const forgotPasswordSchema = z.object({
  login: z.string().min(1, 'Логин или email обязателен'),
});

/**
 * Схема сброса пароля
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Токен обязателен'),
  newPassword: passwordSchema,
});

/**
 * Схема настройки 2FA
 */
export const setup2faSchema = z.object({
  password: z.string().min(1, 'Пароль обязателен'),
});

/**
 * Схема подтверждения 2FA
 */
export const verify2faSchema = z.object({
  code: totpCodeSchema,
  secret: z.string().min(1, 'Секрет обязателен'),
});

/**
 * Схема отключения 2FA
 */
export const disable2faSchema = z.object({
  code: totpCodeSchema,
  password: z.string().min(1, 'Пароль обязателен'),
});

/**
 * Типы, выведенные из схем валидации
 */
export type RegisterInput = z.infer<typeof registerSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type GmlAuthInput = z.infer<typeof gmlAuthSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeLoginInput = z.infer<typeof changeLoginSchema>;
export type Setup2faInput = z.infer<typeof setup2faSchema>;
export type Verify2faInput = z.infer<typeof verify2faSchema>;
export type Disable2faInput = z.infer<typeof disable2faSchema>;