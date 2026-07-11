#!/bin/bash
# ============================================
# Auto-установка AuthLauncher Backend
# Ubuntu 25.10 / Debian 12
# Использование: bash install.sh
# ============================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}    Установка AuthLauncher Backend${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# === Проверка прав ===
if [ "$EUID" -eq 0 ]; then
  echo -e "${RED}Не запускайте скрипт от root. Используйте обычного пользователя с sudo.${NC}"
  exit 1
fi

# === 1. Обновление системы ===
echo -e "${YELLOW}[1/10] Обновление системы...${NC}"
sudo apt update -qq && sudo apt upgrade -y -qq
echo -e "${GREEN}  ✅ Система обновлена${NC}"

# === 2. Установка Node.js LTS ===
echo -e "${YELLOW}[2/10] Установка Node.js LTS...${NC}"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y -qq nodejs
  echo -e "${GREEN}  ✅ Node.js $(node --version) установлен${NC}"
  echo -e "${GREEN}  ✅ npm $(npm --version) установлен${NC}"
else
  echo -e "${GREEN}  ⚡ Node.js $(node --version) уже установлен${NC}"
fi

# === 3. Установка PostgreSQL ===
echo -e "${YELLOW}[3/10] Установка PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
  sudo apt install -y -qq postgresql postgresql-contrib
  echo -e "${GREEN}  ✅ PostgreSQL установлен${NC}"
else
  echo -e "${GREEN}  ⚡ PostgreSQL уже установлен${NC}"
fi

# === 4. Запуск PostgreSQL ===
echo -e "${YELLOW}[4/10] Запуск PostgreSQL...${NC}"
sudo systemctl enable postgresql
sudo systemctl start postgresql
echo -e "${GREEN}  ✅ PostgreSQL запущен${NC}"

# === 5. Создание пользователя и базы данных ===
echo -e "${YELLOW}[5/10] Создание пользователя и базы данных...${NC}"

DB_USER="auth_user"
DB_PASSWORD=$(openssl rand -base64 32 | tr -d /=+ | cut -c1-24)
DB_NAME="auth_launcher"

# Генерируем случайные пароли
JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d /=+)
JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d /=+)
ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d /=+)

# Создаём пользователя БД
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || echo -e "  ⚡ Пользователь ${DB_USER} уже существует"

# Создаём базу данных
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || echo -e "  ⚡ База данных ${DB_NAME} уже существует"

# Назначаем права
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

echo -e "${GREEN}  ✅ Пользователь БД: ${DB_USER}${NC}"
echo -e "${GREEN}  ✅ База данных: ${DB_NAME}${NC}"

# === 6. Создание .env ===
echo -e "${YELLOW}[6/10] Создание .env файла...${NC}"

if [ -f .env ]; then
  echo -e "${YELLOW}  ⚡ .env уже существует. Создаю резервную копию...${NC}"
  cp .env ".env.backup.$(date +%Y%m%d%H%M%S)"
fi

cat > .env << ENVEOF
# === Сервер ===
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# === База данных ===
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public

# === JWT ===
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# === Argon2id ===
ARGON2_MEMORY_COST=65536
ARGON2_TIME_COST=3
ARGON2_PARALLELISM=2
ARGON2_HASH_LENGTH=32

# === TOTP ===
TOTP_ISSUER=AuthLauncher

# === Rate Limiting ===
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_AUTH=5
RATE_LIMIT_MAX_GENERAL=100

# === CORS ===
CORS_ORIGINS=http://localhost:3000

# === Администратор ===
ADMIN_LOGIN=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_EMAIL=admin@example.com
ENVEOF

echo -e "${GREEN}  ✅ .env файл создан${NC}"

# === 7. Установка npm зависимостей ===
echo -e "${YELLOW}[7/10] Установка npm зависимостей...${NC}"
npm ci
echo -e "${GREEN}  ✅ npm зависимости установлены${NC}"

# === 8. Prisma: генерация и миграции ===
echo -e "${YELLOW}[8/10] Настройка Prisma...${NC}"

# Генерируем Prisma Client
npx prisma generate
echo -e "${GREEN}  ✅ Prisma Client сгенерирован${NC}"

# Выполняем миграции
npx prisma migrate dev --name init 2>/dev/null || npx prisma db push
echo -e "${GREEN}  ✅ Prisma миграции выполнены${NC}"

# Запускаем seed
npm run seed
echo -e "${GREEN}  ✅ Seed выполнен${NC}"

# === 9. Создание systemd сервиса ===
echo -e "${YELLOW}[9/10] Создание systemd сервиса...${NC}"

PROJECT_DIR=$(pwd)
NODE_PATH=$(which node)

sudo tee /etc/systemd/system/authlauncher.service > /dev/null << SERVICEEOF
[Unit]
Description=AuthLauncher Backend
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${USER}
WorkingDirectory=${PROJECT_DIR}
ExecStart=${NODE_PATH} $(which npm) run start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF

sudo systemctl daemon-reload
sudo systemctl enable authlauncher.service
sudo systemctl start authlauncher.service

echo -e "${GREEN}  ✅ Systemd сервис создан и запущен${NC}"

# === 10. Проверка ===
echo -e "${YELLOW}[10/10] Проверка сервера...${NC}"
sleep 3

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/health | grep -q "200"; then
  echo -e "${GREEN}  ✅ Сервер отвечает на запросы!${NC}"
else
  echo -e "${RED}  ❌ Сервер не отвечает. Проверьте логи: sudo journalctl -u authlauncher.service -f${NC}"
fi

# === Итоговая информация ===
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}    Установка завершена!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}📋 Информация для входа:${NC}"
echo -e "  ${YELLOW}Логин администратора:${NC} admin"
echo -e "  ${YELLOW}Пароль администратора:${NC} ${ADMIN_PASSWORD}"
echo -e "  ${RED}⚠️  ОБЯЗАТЕЛЬНО смените пароль после первого входа!${NC}"
echo ""
echo -e "${BLUE}🔗 Ссылки:${NC}"
echo -e "  ${YELLOW}API:${NC} http://localhost:3000/api/v1"
echo -e "  ${YELLOW}Health Check:${NC} http://localhost:3000/api/v1/health"
echo ""
echo -e "${BLUE}📝 Команды управления:${NC}"
echo -e "  ${YELLOW}Статус:${NC} sudo systemctl status authlauncher.service"
echo -e "  ${YELLOW}Логи:${NC} sudo journalctl -u authlauncher.service -f"
echo -e "  ${YELLOW}Рестарт:${NC} sudo systemctl restart authlauncher.service"
echo -e "  ${YELLOW}Остановка:${NC} sudo systemctl stop authlauncher.service"
echo ""
echo -e "${BLUE}📁 Важные файлы:${NC}"
echo -e "  ${YELLOW}.env:${NC} ${PROJECT_DIR}/.env"
echo -e "  ${YELLOW}Логи:${NC} sudo journalctl -u authlauncher.service"
echo ""
echo -e "${GREEN}============================================${NC}"