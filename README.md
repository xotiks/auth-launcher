# AuthLauncher Backend

**Собственный сервер авторизации для GML Launcher**

Высоконагруженная, безопасная и расширяемая система авторизации, построенная на Node.js, Express, PostgreSQL и Prisma.

---

## ⚡ Стек

- **Node.js** (LTS v22+)
- **Express** (v4)
- **PostgreSQL** (v17)
- **Prisma** ORM (v6)
- **TypeScript** (v5)
- **JWT** (access + refresh токены)
- **Argon2id** — хеширование паролей
- **Helmet** — HTTP security headers
- **CORS** — whitelist
- **Zod** — валидация входных данных
- **Pino** — логирование
- **OTP Lib** — TOTP (Google Authenticator, Aegis, Authy)

---

## 🚀 Быстрый старт

### Ubuntu 25.10 / Debian 12

```bash
# 1. Клонируем репозиторий
git clone https://github.com/ваш-username/auth-launcher.git
cd auth-launcher

# 2. Запускаем автоматическую установку
# Скрипт сделает всё: установит Node.js, PostgreSQL, создаст БД, настроит сервис
bash install.sh
```

После установки:
- **API**: http://localhost:3000/api/v1
- **Health Check**: http://localhost:3000/api/v1/health
- **Логин администратора**: admin
- **Пароль**: будет сгенерирован и выведен скриптом

### Docker

```bash
# 1. Создаём .env файл (обязательно!)
cp .env.example .env
# Отредактируйте .env, установите свои JWT_ACCESS_SECRET и JWT_REFRESH_SECRET

# 2. Запускаем
docker-compose up -d

# 3. Выполняем миграции и seed
docker exec authlauncher-backend npx prisma db push
docker exec authlauncher-backend npm run seed
```

### Ручной запуск (разработка)

```bash
# 1. Устанавливаем зависимости
npm ci

# 2. Создаём .env
cp .env.example .env
# Отредактируйте .env

# 3. Настраиваем PostgreSQL
# Создайте пользователя и БД

# 4. Prisma
npx prisma generate
npx prisma db push
npm run seed

# 5. Запускаем
npm run dev
```

---

## 📋 Переменные окружения (.env)

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `NODE_ENV` | Режим работы | `development` |
| `PORT` | Порт сервера | `3000` |
| `HOST` | Хост | `0.0.0.0` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_ACCESS_SECRET` | Секрет для access токена | — |
| `JWT_REFRESH_SECRET` | Секрет для refresh токена | — |
| `JWT_ACCESS_EXPIRES_IN` | Время жизни access токена | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Время жизни refresh токена | `7d` |
| `ARGON2_MEMORY_COST` | Память для Argon2id | `65536` |
| `ARGON2_TIME_COST` | Итерации Argon2id | `3` |
| `TOTP_ISSUER` | Издатель для TOTP | `AuthLauncher` |
| `RATE_LIMIT_MAX_AUTH` | Макс. попыток входа | `5` |
| `RATE_LIMIT_MAX_GENERAL` | Макс. общих запросов | `100` |
| `CORS_ORIGINS` | Разрешённые источники | `http://localhost:3000` |

---

## 📚 API Документация

### Аутентификация

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/auth/register` | Регистрация |
| POST | `/api/v1/auth/signin` | Вход |
| POST | `/api/v1/auth/refresh` | Обновление токена |
| POST | `/api/v1/auth/logout` | Выход |

### Профиль

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/profile` | Информация о профиле |
| PUT | `/api/v1/profile/password` | Смена пароля |
| PUT | `/api/v1/profile/login` | Смена логина |
| DELETE | `/api/v1/profile/account` | Удаление аккаунта |

### 2FA

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/2fa/setup` | Настройка TOTP |
| POST | `/api/v1/2fa/verify` | Подтверждение TOTP |
| POST | `/api/v1/2fa/disable` | Отключение 2FA |

### GML Интеграция

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/integrations/auth/signin` | Авторизация для GML |

### Администрирование

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/admin/users` | Список пользователей |
| GET | `/api/v1/admin/users/:uuid` | Информация о пользователе |
| POST | `/api/v1/admin/users/:uuid/ban` | Блокировка |
| POST | `/api/v1/admin/users/:uuid/unban` | Разблокировка |
| PUT | `/api/v1/admin/users/:uuid/role` | Изменение роли |
| DELETE | `/api/v1/admin/users/:uuid` | Удаление пользователя |
| GET | `/api/v1/admin/users/:uuid/history` | История входов |

### Система

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/health` | Health Check |

---

## 🔐 Безопасность

- **Argon2id** — самый безопасный алгоритм хеширования паролей
- **Helmet** — защита от известных веб-уязвимостей
- **Rate Limiting** — 5 попыток входа в минуту
- **Slow Down** — защита от перебора (задержка после 3 попыток)
- **IP Block** — автоматическая блокировка IP после подозрительной активности
- **Account Lockout** — блокировка аккаунта после 5 неудачных попыток
- **Password History** — защита от повторного использования паролей
- **Timing Attack** — безопасное сравнение строк
- **User Enumeration** — единое сообщение об ошибке
- **CORS** — строгий whitelist
- **Body Size Limit** — ограничение размера запросов
- **TOTP** — двухфакторная аутентификация (Google Authenticator, Aegis, Authy)
- **Все ошибки** — единый формат ответа

---

## 🏗️ Структура проекта

```
src/
├── config/         # Конфигурация (env, app config)
├── controllers/    # HTTP контроллеры (тонкий слой)
├── services/       # Бизнес-логика (толстый слой)
├── repositories/   # Доступ к данным (Prisma)
├── middlewares/     # Middleware (auth, security, validation)
├── routes/         # Express роуты
├── validators/     # Zod схемы валидации
├── database/       # Prisma клиент (Singleton)
├── utils/          # Утилиты (crypto, errors, logger, totp)
├── types/          # TypeScript типы
├── integrations/   # Адаптеры (GML и др.)
├── app.ts          # Сборка Express приложения
└── index.ts        # Точка входа
```

---

## 🤖 Интеграция с GML

GML лаунчер отправляет запрос на `POST /api/v1/integrations/auth/signin`:
```json
{
  "Login": "username",
  "Password": "password",
  "Totp": "123456"
}
```

Ответ в формате GML:
```json
{
  "Login": "username",
  "UserUuid": "uuid-строка",
  "Message": "Успешная авторизация"
}
```

Статусы ответа:
- **200** — успешная авторизация
- **401** — неверные данные
- **403** — пользователь заблокирован
- **423** — аккаунт временно заблокирован
- **429** — слишком много запросов

---

## 📦 Команды

```bash
npm run dev          # Запуск в режиме разработки
npm run build        # Сборка TypeScript
npm start            # Запуск production сборки
npm run seed         # Инициализация БД (роли и админ)
npm test             # Запуск тестов
npm run prisma:studio # Prisma Studio (GUI для БД)
```

---

## 🔄 Обновление

```bash
git pull
npm ci
npx prisma generate
npx prisma migrate deploy
sudo systemctl restart authlauncher.service
```

## 💾 Резервное копирование

```bash
# Бэкап базы данных
pg_dump -U auth_user -d auth_launcher > backup_$(date +%Y%m%d).sql

# Восстановление
psql -U auth_user -d auth_launcher < backup_20240101.sql
```

---

## 📄 Лицензия

MIT