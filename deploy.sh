#!/bin/bash
# ============================================
# Деплой сайта + SSL для AuthLauncher
# Домен: prshield.serp-hub.ru
# IP: 80.254.102.229
# Запуск: sudo bash deploy.sh
#
# Исправленная версия — клонирует репозиторий
# для получения фронтенда
# ============================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

DOMAIN="prshield.serp-hub.ru"
# !!! Email для Let's Encrypt — замени на свой если хочешь
EMAIL="admin@prshield.serp-hub.ru"
BACKEND_PORT=3419
FRONTEND_DIR="/var/www/prshield"
VERSION="v1.0.0"

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  Деплой AuthLauncher + SSL${NC}"
echo -e "${CYAN}  Домен: ${DOMAIN}${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Проверка root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Запустите с sudo: sudo bash deploy.sh${NC}"
  exit 1
fi

# ============ 1. Установка пакетов ============
echo -e "${YELLOW}[1/5] Установка Nginx и Certbot...${NC}"
apt update -qq
apt install -y -qq nginx certbot python3-certbot-nginx curl git
echo -e "${GREEN}  ✅ Готово${NC}"

# ============ 2. Получение фронтенда из репозитория ============
echo -e "${YELLOW}[2/5] Получение фронтенда...${NC}"

TMP_DIR="/tmp/authlauncher-frontend"
rm -rf "$TMP_DIR"
git clone --branch "$VERSION" --depth 1 "https://github.com/xotiks/auth-launcher.git" "$TMP_DIR" 2>/dev/null || \
git clone --depth 1 "https://github.com/xotiks/auth-launcher.git" "$TMP_DIR"

if [ -d "$TMP_DIR/frontend" ]; then
  mkdir -p "$FRONTEND_DIR"
  cp -r "$TMP_DIR/frontend/"* "$FRONTEND_DIR/"
  chown -R www-data:www-data "$FRONTEND_DIR"
  rm -rf "$TMP_DIR"
  echo -e "${GREEN}  ✅ Фронтенд скопирован в ${FRONTEND_DIR}${NC}"
else
  echo -e "${RED}  ❌ Ошибка: папка frontend не найдена в репозитории${NC}"
  rm -rf "$TMP_DIR"
  exit 1
fi

# Меняем API_URL в конфиге на HTTPS
sed -i "s|window.location.origin + '/api/v1'|'https://${DOMAIN}/api/v1'|g" "$FRONTEND_DIR/config.js" 2>/dev/null || true

# ============ 3. Настройка Nginx ============
echo -e "${YELLOW}[3/5] Настройка Nginx...${NC}"

cat > /etc/nginx/sites-available/prshield << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};
    root ${FRONTEND_DIR};
    index index.html;

    # Статика (фронтенд)
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
    }

    # API прокси на backend
    location /api/v1/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 10k;
        proxy_read_timeout 30s;
    }
}
NGINXEOF

# Включаем сайт
ln -sf /etc/nginx/sites-available/prshield /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t && systemctl reload nginx
echo -e "${GREEN}  ✅ Nginx настроен${NC}"

# ============ 4. SSL сертификат ============
echo -e "${YELLOW}[4/5] Получение SSL сертификата...${NC}"

# Проверяем что домен отвечает
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${DOMAIN}/" --connect-timeout 10 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "000" ]; then
  echo -e "${YELLOW}  ⚠️  Домен ${DOMAIN} пока не отвечает по HTTP.${NC}"
  echo -e "${YELLOW}  Убедись что DNS-запись prshield.serp-hub.ru указывает на этот сервер (80.254.102.229)${NC}"
  echo -e "${YELLOW}  После настройки DNS запусти: certbot --nginx -d ${DOMAIN} --agree-tos --email ${EMAIL}${NC}"
else
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" || \
  certbot --nginx -d "$DOMAIN" --register-unsafely-without-email || true
  echo -e "${GREEN}  ✅ SSL сертификат получен!${NC}"
fi

# ============ 5. Проверка ============
echo -e "${YELLOW}[5/5] Проверка...${NC}"
sleep 2

echo ""
echo -e "${CYAN}📋 Результат:${NC}"
echo -e "  ${YELLOW}Сайт:${NC}        https://${DOMAIN}"
echo -e "  ${YELLOW}API:${NC}          https://${DOMAIN}/api/v1/health"
echo -e "  ${YELLOW}Регистрация:${NC}  https://${DOMAIN}/register.html"
echo -e "  ${YELLOW}Вход:${NC}         https://${DOMAIN}/login.html"
echo -e "  ${YELLOW}Профиль:${NC}      https://${DOMAIN}/profile.html"
echo ""
echo -e "${CYAN}📝 Команды:${NC}"
echo -e "  ${YELLOW}Логи:${NC}         journalctl -u nginx -f"
echo -e "  ${YELLOW}Обновить SSL:${NC}  certbot renew"
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Деплой завершён!${NC}"
echo -e "${GREEN}============================================${NC}"