// Главный конфигурационный файл
// Экспортирует единый объект конфигурации для всего приложения

import { loadEnvConfig, type EnvConfig } from './env';
import { logger } from '../utils/logger';

/**
 * Единый объект конфигурации приложения
 */
class AppConfig {
  private static instance: AppConfig;
  public readonly env: EnvConfig;

  private constructor() {
    this.env = loadEnvConfig();
  }

  /**
   * Получить экземпляр конфигурации (Singleton)
   */
  public static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  /**
   * Проверить, работает ли приложение в режиме разработки
   */
  public get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }

  /**
   * Проверить, работает ли приложение в production
   */
  public get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /**
   * Проверить, работает ли приложение в режиме тестирования
   */
  public get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  /**
   * Получить список разрешённых CORS источников
   */
  public get corsOrigins(): string[] {
    return this.env.CORS_ORIGINS.split(',').map((origin) => origin.trim());
  }

  /**
   * Нужно ли доверять proxy заголовкам (X-Forwarded-For и др.)
   */
  public get trustProxy(): boolean {
    const raw = this.env.TRUST_PROXY.trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  /**
   * Настройки Argon2id для хеширования паролей
   */
  public get argon2Options() {
    return {
      memoryCost: this.env.ARGON2_MEMORY_COST,
      timeCost: this.env.ARGON2_TIME_COST,
      parallelism: this.env.ARGON2_PARALLELISM,
      hashLength: this.env.ARGON2_HASH_LENGTH,
    };
  }

  /**
   * Настройки rate limiting
   */
  public get rateLimitOptions() {
    return {
      windowMs: this.env.RATE_LIMIT_WINDOW_MS,
      maxAuth: this.env.RATE_LIMIT_MAX_AUTH,
      maxGeneral: this.env.RATE_LIMIT_MAX_GENERAL,
    };
  }

  /**
   * Настройки JWT
   */
  public get jwtOptions() {
    return {
      accessSecret: this.env.JWT_ACCESS_SECRET,
      refreshSecret: this.env.JWT_REFRESH_SECRET,
      accessExpiresIn: this.env.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: this.env.JWT_REFRESH_EXPIRES_IN,
    };
  }
}

// Создаём и экспортируем единственный экземпляр конфигурации
export const config = AppConfig.getInstance();
export type { AppConfig };