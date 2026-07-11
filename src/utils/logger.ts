// Настройка логирования с использованием Pino
// Все логи пишутся в stdout и в файл (в production)

import pino from 'pino';

/**
 * Создание экземпляра логгера
 * В development: красочный вывод в консоль
 * В production: JSON формат для сбора логов
 * В test: тихий режим (только ошибки)
 */
export function createLogger(): pino.Logger {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isTest = process.env.NODE_ENV === 'test';

  const options: pino.LoggerOptions = {
    level: isTest ? 'silent' : (isDevelopment ? 'debug' : 'info'),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.Password',
        'body.Totp',
        'body.2FACode',
        'body.password',
        'body.newPassword',
        'body.oldPassword',
        'passwordHash',
        'password_hash',
        'totpSecret',
        'totp_secret',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req: (req: any) => ({
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res: (res: any) => ({
        statusCode: res.statusCode,
      }),
      err: pino.stdSerializers.err,
    },
  };

  if (isDevelopment) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  return pino(options);
}

// Экспортируем единственный экземпляр логгера
export const logger = createLogger();