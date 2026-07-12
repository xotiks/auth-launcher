# Dockerfile для AuthLauncher Backend
# Мультистейдж сборка для production

# === Этап 1: Сборка ===
FROM node:22-alpine AS builder

WORKDIR /app

# Копируем конфигурационные файлы
COPY package.json package-lock.json tsconfig.json ./

# Устанавливаем все зависимости для сборки
RUN npm ci

# Копируем исходный код
COPY prisma/ ./prisma/
COPY src/ ./src/

# Генерируем Prisma Client
RUN npx prisma generate

# Собираем TypeScript
RUN npm run build

# === Этап 2: Production ===
FROM node:22-alpine AS production

WORKDIR /app

# Устанавливаем curl для healthcheck
RUN apk add --no-cache curl

# Копируем собранный код из builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

# Создаём непривилегированного пользователя
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Переменные окружения
ENV NODE_ENV=production
EXPOSE 3419

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3419/api/v1/health || exit 1

# Запуск
CMD ["node", "dist/index.js"]