// Главный файл Express приложения
// Настройка middleware, роутов, обработчиков ошибок

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { additionalSecurityHeaders, generalRateLimiter } from './middlewares/security';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import totpRoutes from './routes/totp.routes';
import gmlRoutes from './routes/gml.routes';
import adminRoutes from './routes/admin.routes';

/**
 * Создание и настройка Express приложения
 */
export function createApp(): express.Application {
  const app = express();

   // Если сервер работает за обратным прокси (Nginx) — доверяем X-Forwarded заголовкам
   if (config.trustProxy) {
     app.set('trust proxy', 1);
   }

  app.use(
    helmet({
      contentSecurityPolicy: false, // Отключаем для API (если не отдаём HTML)
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS — ограничение доступа по источникам
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 86400, // 24 часа
    })
  );

  // Парсинг JSON тела запроса с ограничением размера
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Парсинг cookies
  app.use(cookieParser());

  // Сжатие ответов
  app.use(compression());

  // Дополнительные security headers
  app.use(additionalSecurityHeaders);

  // === Rate Limiting ===
  // Общий rate limiter для всех /api запросов
  app.use('/api', generalRateLimiter);

  // === Роуты ===

  // Health check
  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({
      success: true,
      message: 'Сервер работает',
      data: {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
      timestamp: new Date().toISOString(),
    });
  });

  // API v1 роуты
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/profile', profileRoutes);
  app.use('/api/v1/2fa', totpRoutes);
  app.use('/api/v1/admin', adminRoutes);

  // GML интеграция (отдельный префикс)
  app.use('/api/v1/integrations', gmlRoutes);

  // === Обработчики ошибок ===

  // 404 — маршрут не найден
  app.use(notFoundHandler);

  // Глобальный обработчик ошибок (должен быть последним)
  app.use(errorHandler);

  return app;
}