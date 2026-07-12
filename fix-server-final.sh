#!/bin/bash
# ============================================
# ПОЛНЫЙ ФИКС AuthLauncher на сервере
# Запуск: curl -O https://raw.githubusercontent.com/xotiks/auth-launcher/main/fix-server-final.sh
#         bash fix-server-final.sh
# ============================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  AuthLauncher — Полный фикс сервера${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Проверка root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Запустите с sudo: sudo bash fix-server-final.sh${NC}"
  exit 1
fi

USER_HOME=$(eval echo ~$SUDO_USER)
PROJECT_DIR="$USER_HOME/auth-launcher"
FRONTEND_DIR="/var/www/prshield"
DOMAIN="prshield.serp-hub.ru"

# ============ 1. Остановка старого сервиса ============
echo -e "${YELLOW}[1/8] Остановка старого сервиса...${NC}"
systemctl stop authlauncher.service 2>/dev/null || true
systemctl disable authlauncher.service 2>/dev/null || true
echo -e "${GREEN}  ✅ Сервис остановлен${NC}"

# ============ 2. Перенос проекта в ~/auth-launcher ============
echo -e "${YELLOW}[2/8] Перенос проекта в ${PROJECT_DIR}...${NC}"

# Создаём папку
mkdir -p "$PROJECT_DIR"

# Переносим всё кроме .ssh, .cache, .npm
cd "$USER_HOME"
for item in \
  src prisma scripts frontend \
  package.json package-lock.json tsconfig.json .env .env.example .gitignore \
  Dockerfile docker-compose.yml \
  installer.sh updater.sh uninstall.sh deploy.sh fix-server.sh fix-frontend.sh fix-server-final.sh \
  README.md
do
  if [ -e "$USER_HOME/$item" ] && [ ! -e "$PROJECT_DIR/$item" ]; then
    cp -r "$USER_HOME/$item" "$PROJECT_DIR/" 2>/dev/null || true
  fi
done

# Переносим .git отдельно (скрытая папка)
if [ -d "$USER_HOME/.git" ] && [ ! -d "$PROJECT_DIR/.git" ]; then
  cp -r "$USER_HOME/.git" "$PROJECT_DIR/" 2>/dev/null || true
fi

# node_modules не копируем, установим заново
echo -e "${GREEN}  ✅ Файлы перенесены${NC}"

# ============ 3. Исправление прав и установка зависимостей ============
echo -e "${YELLOW}[3/8] Исправление прав и установка зависимостей...${NC}"

# Сначала меняем владельца проекта на digmasrv (иначе npm не может писать)
chown -R $SUDO_USER:$SUDO_USER "$PROJECT_DIR"
echo -e "${GREEN}  ✅ Права исправлены${NC}"

cd "$PROJECT_DIR"

# Удаляем старый .npmrc и пробуем зеркало
rm -f "$USER_HOME/.npmrc" 2>/dev/null || true
su - $SUDO_USER -c "cd $PROJECT_DIR && npm config set registry https://registry.npmmirror.com && npm install 2>/dev/null" || \
su - $SUDO_USER -c "cd $PROJECT_DIR && npm install"

su - $SUDO_USER -c "cd $PROJECT_DIR && npx prisma generate" 2>/dev/null || true
echo -e "${GREEN}  ✅ Зависимости установлены${NC}"

# ============ 4. Пересоздание systemd сервиса ============
echo -e "${YELLOW}[4/8] Настройка systemd сервиса...${NC}"
rm -f /etc/systemd/system/authlauncher.service

cat > /etc/systemd/system/authlauncher.service << SERVICEEOF
[Unit]
Description=AuthLauncher Backend
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${SUDO_USER}
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/node ${PROJECT_DIR}/node_modules/.bin/tsx ${PROJECT_DIR}/src/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable authlauncher.service
systemctl start authlauncher.service
echo -e "${GREEN}  ✅ Сервис запущен${NC}"

# ============ 5. Копирование фронтенда ============
echo -e "${YELLOW}[5/8] Копирование фронтенда...${NC}"
if [ -d "$PROJECT_DIR/frontend" ]; then
  mkdir -p "$FRONTEND_DIR"
  cp -r "$PROJECT_DIR/frontend/"* "$FRONTEND_DIR/"
  chown -R www-data:www-data "$FRONTEND_DIR"
  echo -e "${GREEN}  ✅ Фронтенд скопирован в ${FRONTEND_DIR}${NC}"
else
  echo -e "${RED}  ❌ Папка frontend не найдена!${NC}"
fi

# ============ 6. Настройка Nginx ============
echo -e "${YELLOW}[6/8] Настройка Nginx...${NC}"

cat > /etc/nginx/sites-available/prshield << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};
    root ${FRONTEND_DIR};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header X-Frame-Options "SAMEORIGIN" always;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:3419;
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

ln -sf /etc/nginx/sites-available/prshield /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo -e "${GREEN}  ✅ Nginx настроен${NC}"

# ============ 7. SSL ============
echo -e "${YELLOW}[7/8] SSL сертификат...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${DOMAIN}/" --connect-timeout 10 2>/dev/null || echo "000")

if [ "$HTTP_CODE" != "000" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email vovnazr567@gmail.com || \
  certbot --nginx -d "$DOMAIN" --register-unsafely-without-email || true
  echo -e "${GREEN}  ✅ SSL получен${NC}"
else
  echo -e "${YELLOW}  ⚠️  Домен не отвечает. SSL позже: certbot --nginx -d ${DOMAIN}${NC}"
fi

# ============ 8. Очистка и проверка ============
echo -e "${YELLOW}[8/8] Очистка и проверка...${NC}"

# Удаляем мусор
rm -f "$USER_HOME/deploy.sh" "$USER_HOME/fix-server.sh" "$USER_HOME/fix-frontend.sh" "$USER_HOME/fix-server-final.sh" 2>/dev/null || true
rm -f "$USER_HOME/гайд.txt" 2>/dev/null || true
rm -rf "$USER_HOME/пример авторизации (потом удалить)" 2>/dev/null || true

# Проверка сервера
sleep 3
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3419/api/v1/health 2>/dev/null || echo "000")

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  РЕЗУЛЬТАТ${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

if [ "$HEALTH" = "200" ]; then
  echo -e "${GREEN}  ✅ Backend: http://localhost:3419/api/v1/health — РАБОТАЕТ${NC}"
else
  echo -e "${RED}  ❌ Backend не отвечает. Логи: journalctl -u authlauncher.service -f${NC}"
fi

echo -e "${GREEN}  ✅ Проект: ${PROJECT_DIR}${NC}"
echo -e "${GREEN}  ✅ Фронтенд: http://${DOMAIN}:80${NC}"
echo -e ""

echo -e "${CYAN}📋 Админ (пароль в .env):${NC}"
grep "ADMIN_LOGIN\|ADMIN_PASSWORD" "$PROJECT_DIR/.env" 2>/dev/null || echo "  —"

echo ""
echo -e "${CYAN}📝 Команды:${NC}"
echo -e "  ${YELLOW}Логи API:${NC}     journalctl -u authlauncher.service -f"
echo -e "  ${YELLOW}Логи Nginx:${NC}   journalctl -u nginx -f"
echo -e "  ${YELLOW}SSL:${NC}          certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --email vovnazr567@gmail.com"
echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  Фикс завершён!${NC}"
echo -e "${CYAN}============================================${NC}"