#!/bin/bash
# ============================================
# AuthLauncher Installer
# Автономная установка за 2 команды:
#   curl -O https://raw.githubusercontent.com/xotiks/auth-launcher/main/installer.sh
#   sudo chmod +x ./installer.sh && sudo ./installer.sh --version v1.0.0
# ============================================
set -e

# Цвета
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# Версия по умолчанию
VERSION="v1.0.0"
PORT="3419"
DOMAIN=""
SSL_EMAIL="admin@example.com"

# Парсинг аргументов
while [[ $# -gt 0 ]]; do
  case $1 in
    --version) VERSION="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --ssl-email) SSL_EMAIL="$2"; shift 2 ;;
    --help)
      echo -e "${CYAN}Использование:${NC}"
      echo "  sudo ./installer.sh [опции]"
      echo ""
      echo -e "${CYAN}Опции:${NC}"
      echo "  --version TAG      Версия для установки (по умолч. v1.0.0)"
      echo "  --port PORT        Порт сервера (по умолч. 3419)"
      echo "  --domain DOMAIN    Домен для SSL (Nginx + Certbot)"
      echo "  --ssl-email EMAIL  Email для Let's Encrypt"
      echo "  --remove           Полное удаление"
      echo "  --help             Эта справка"
      exit 0
      ;;
    --remove)
      echo -e "${YELLOW}Запуск удаления...${NC}"
      if [ -f uninstall.sh ]; then
        bash uninstall.sh
      else
        curl -sS -O "https://raw.githubusercontent.com/xotiks/auth-launcher/main/uninstall.sh" && \
        bash uninstall.sh
      fi
      exit 0
      ;;
    *)
      echo -e "${RED}Неизвестный аргумент: $1${NC}"
      echo "Используйте --help для справки"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  AuthLauncher Installer ${VERSION}${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# === Определяем реального пользователя (не root) ===
if [ -n "$SUDO_USER" ]; then
  REAL_USER="$SUDO_USER"
elif [ "$EUID" -eq 0 ]; then
  echo -e "${YELLOW}Запущено от root. Используйте sudo от обычного пользователя.${NC}"
  echo -e "${YELLOW}Продолжаем...${NC}"
  REAL_USER="root"
else
  REAL_USER="$USER"
  echo -e "${YELLOW}Запущено не через sudo. Некоторые операции могут требовать sudo.${NC}"
  echo -e "${YELLOW}Если будут ошибки — запустите: sudo ./installer.sh${NC}"
  echo ""
fi

echo -e "${GREEN}  Пользователь: ${REAL_USER}${NC}"
echo ""

PROJECT_DIR=$(pwd)
REAL_HOME=$(eval echo ~$REAL_USER)

# === 1. Обновление пакетов ===
echo -e "${YELLOW}[1/10] Установка системных зависимостей...${NC}"
apt update -qq
apt install -y -qq curl wget git openssl postgresql postgresql-contrib nginx certbot python3-certbot-nginx 2>/dev/null || true
echo -e "${GREEN}  ✅ Системные пакеты установлены${NC}"

# === 2. Установка Node.js LTS если нет ===
echo -e "${YELLOW}[2/10] Проверка Node.js...${NC}"
if ! command -v node &>/dev/null || [[ $(node --version | cut -d'.' -f1 | tr -d 'v') -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y -qq nodejs
fi
echo -e "${GREEN}  ✅ Node.js $(node --version)${NC}"

# === 3. Запуск PostgreSQL ===
echo -e "${YELLOW}[3/10] Запуск PostgreSQL...${NC}"
systemctl enable postgresql 2>/dev/null
systemctl start postgresql 2>/dev/null
echo -e "${GREEN}  ✅ PostgreSQL запущен${NC}"

# === 4. Клонирование репозитория если нет package.json ===
echo -e "${YELLOW}[4/10] Получение исходного кода...${NC}"
if [ ! -f package.json ]; then
  REPO_URL="https://github.com/xotiks/auth-launcher.git"
  git clone --branch "$VERSION" --depth 1 "$REPO_URL" /tmp/auth-launcher 2>/dev/null || \
  git clone --depth 1 "$REPO_URL" /tmp/auth-launcher
  cp -r /tmp/auth-launcher/* . 2>/dev/null || true
  cp -r /tmp/auth-launcher/.* . 2>/dev/null || true
  rm -rf /tmp/auth-launcher
  chown -R $REAL_USER:$REAL_USER . 2>/dev/null || true
  echo -e "${GREEN}  ✅ Код получен${NC}"
else
  echo -e "${GREEN}  ⚡ Код уже есть, пропускаем${NC}"
fi

# === 5. Создание .env ===
echo -e "${YELLOW}[5/10] Создание .env...${NC}"
DB_USER="auth_user"
DB_PASSWORD=$(openssl rand -base64 32 | tr -d /=+ | cut -c1-24)
DB_NAME="auth_launcher"
JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d /=+)
JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d /=+)
ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d /=+)

# Создаём пользователя БД
su - postgres -c "psql -t -c \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1 || \
su - postgres -c "psql -c \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';\""

# Создаём базу
su - postgres -c "psql -t -c \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 || \
su - postgres -c "psql -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};\""

su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};\"" 2>/dev/null

# Сохраняем старый .env
[ -f .env ] && cp .env ".env.backup.$(date +%Y%m%d%H%M%S)"

cat > .env << ENVEOF
# === Сервер ===
NODE_ENV=production
PORT=${PORT}
HOST=0.0.0.0

# === База данных ===
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public

# === JWT (автосгенерированы) ===
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
CORS_ORIGINS=http://localhost:${PORT}

# === Администратор ===
ADMIN_LOGIN=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_EMAIL=admin@example.com

# === SSL (только при --domain) ===
DOMAIN=${DOMAIN}
SSL_EMAIL=${SSL_EMAIL}
ENVEOF

chown $REAL_USER:$REAL_USER .env 2>/dev/null || true
echo -e "${GREEN}  ✅ .env создан (все секреты сгенерированы)${NC}"

# === 6. npm зависимости (с зеркалом если registry недоступен) ===
echo -e "${YELLOW}[6/10] Установка npm зависимостей...${NC}"

# Пробуем основной registry, если ошибка — переключаем на зеркало
npm_registry_setup() {
  # Проверяем доступность npm registry
  if curl -s --connect-timeout 5 https://registry.npmjs.org/ | grep -q "error" 2>/dev/null; then
    echo -e "${YELLOW}  ⚡ registry.npmjs.org недоступен, использую зеркало npmmirror.com${NC}"
    su - $REAL_USER -c "cd ${PROJECT_DIR} && npm config set registry https://registry.npmmirror.com"
  fi
}
npm_registry_setup

su - $REAL_USER -c "cd ${PROJECT_DIR} && npm ci 2>/dev/null || npm install 2>/dev/null || (npm config set registry https://registry.npmmirror.com && npm install)"
su - $REAL_USER -c "cd ${PROJECT_DIR} && npx prisma generate 2>/dev/null || npm install -g prisma && npx prisma generate"
echo -e "${GREEN}  ✅ npm зависимости и Prisma Client установлены${NC}"

# === 7. Миграции и seed ===
echo -e "${YELLOW}[7/10] Настройка базы данных...${NC}"
su - $REAL_USER -c "cd ${PROJECT_DIR} && npx prisma db push 2>/dev/null"
su - $REAL_USER -c "cd ${PROJECT_DIR} && npm run seed 2>/dev/null || npx tsx scripts/seed.ts"
echo -e "${GREEN}  ✅ База данных настроена${NC}"

# === 8. Системный сервис ===
echo -e "${YELLOW}[8/10] Создание systemd сервиса...${NC}"
NODE_PATH=$(which node)

cat > /etc/systemd/system/authlauncher.service << SERVICEEOF
[Unit]
Description=AuthLauncher Backend
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${REAL_USER}
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

systemctl daemon-reload
systemctl enable authlauncher.service
systemctl restart authlauncher.service
echo -e "${GREEN}  ✅ Сервис authlauncher запущен${NC}"

# === 9. SSL / Nginx (если --domain) ===
if [ -n "$DOMAIN" ]; then
  echo -e "${YELLOW}[9/10] Настройка Nginx + SSL для ${DOMAIN}...${NC}"

  cat > /etc/nginx/sites-available/authlauncher << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 10k;
    }
}
NGINXEOF

  ln -sf /etc/nginx/sites-available/authlauncher /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx

  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$SSL_EMAIL" || \
  echo -e "${YELLOW}  ⚠️  SSL не удался. Сделайте позже: certbot --nginx -d ${DOMAIN}${NC}"

  echo -e "${GREEN}  ✅ SSL настроен! https://${DOMAIN}${NC}"
else
  echo -e "${YELLOW}[9/10] SSL пропущен (укажите --domain для HTTPS)${NC}"
fi

# === 10. Проверка ===
echo -e "${YELLOW}[10/10] Проверка сервера...${NC}"
sleep 3

if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/api/v1/health" | grep -q "200"; then
  echo -e "${GREEN}  ✅ Сервер отвечает!${NC}"
else
  echo -e "${RED}  ❌ Сервер не отвечает. Проверьте: journalctl -u authlauncher.service -f${NC}"
fi

# === Итог ===
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Установка завершена!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${CYAN}🌐 Сервер:${NC}"
echo -e "  ${YELLOW}API:${NC}           http://localhost:${PORT}/api/v1"
echo -e "  ${YELLOW}Health Check:${NC}  http://localhost:${PORT}/api/v1/health"
if [ -n "$DOMAIN" ]; then
  echo -e "  ${YELLOW}HTTPS:${NC}         https://${DOMAIN}/api/v1"
fi
echo ""
echo -e "${CYAN}👤 Администратор:${NC}"
echo -e "  ${YELLOW}Логин:${NC}         admin"
echo -e "  ${YELLOW}Пароль:${NC}        ${ADMIN_PASSWORD}"
echo -e "  ${RED}⚠️  Смените пароль после первого входа!${NC}"
echo ""
echo -e "${CYAN}📝 Команды:${NC}"
echo -e "  ${YELLOW}Статус:${NC}        systemctl status authlauncher.service"
echo -e "  ${YELLOW}Логи:${NC}          journalctl -u authlauncher.service -f"
echo -e "  ${YELLOW}Рестарт:${NC}       systemctl restart authlauncher.service"
echo ""
echo -e "${CYAN}🔄 Обновление:${NC}"
echo -e "  ${YELLOW}curl -O https://raw.githubusercontent.com/xotiks/auth-launcher/main/updater.sh${NC}"
echo -e "  ${YELLOW}sudo chmod +x updater.sh && sudo ./updater.sh --version ${VERSION}${NC}"
echo ""
echo -e "${CYAN}🗑️  Удаление:${NC}"
echo -e "  ${YELLOW}sudo ./installer.sh --remove${NC}"
echo -e "  ${YELLOW}ИЛИ: curl -O https://raw.githubusercontent.com/xotiks/auth-launcher/main/uninstall.sh && sudo bash uninstall.sh${NC}"
echo ""
echo -e "${GREEN}============================================${NC}"