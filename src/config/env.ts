// Конфигурация переменных окружения
// Все секреты и настройки загружаются только из process.env
// Никаких паролей в коде!

import { z } from 'zod';

/**
 * Схема валидации переменных окружения
 * Все переменные проверяются при запуске приложения
 */
const envSchema = z.object({
  // Сервер
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3419),
  HOST: z.string().default('0.0.0.0'),

  // База данных
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET должен быть минимум 32 символа'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET должен быть минимум 32 символа'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Argon2id
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(2),
  ARGON2_HASH_LENGTH: z.coerce.number().int().positive().default(32),

  // TOTP
  TOTP_ISSUER: z.string().default('AuthLauncher'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_AUTH: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_MAX_GENERAL: z.coerce.number().int().positive().default(100),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3419'),
});

/**
 * Тип конфигурации, выведенный из схемы
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Загрузка и валидация переменных окружения
 * Вызывается один раз при старте приложения
 */
export function loadEnvConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Ошибка валидации переменных окружения:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}