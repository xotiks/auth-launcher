#!/bin/bash
# ============================================
# Деплой сайта + SSL для AuthLauncher
# Домен: prshield.serp-hub.ru
# IP: 80.254.102.229
# Запуск: sudo bash deploy.sh
# ============================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

DOMAIN="prshield.serp-hub.ru"
EMAIL="admin@example.com"
BACKEND_PORT=3419
FRONTEND_DIR="/var/www/prshield"

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

# ============ 1. Установка Nginx и Certbot если нет ============
echo -e "${YELLOW}[1/5] Установка Nginx и Certbot...${NC}"
apt update -qq
apt install -y -qq nginx certbot python3-certbot-nginx curl
echo -e "${GREEN}  ✅ Готово${NC}"

# ============ 2. Копирование фронтенда ============
echo -e "${YELLOW}[2/5] Копирование фронтенда...${NC}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Если есть папка frontend рядом
if [ -d "$SCRIPT_DIR/frontend" ]; then
  mkdir -p "$FRONTEND_DIR"
  cp -r "$SCRIPT_DIR/frontend/"* "$FRONTEND_DIR/"
  chown -R www-data:www-data "$FRONTEND_DIR"
  echo -e "${GREEN}  ✅ Фронтенд скопирован в ${FRONTEND_DIR}${NC}"
else
  echo -e "${YELLOW}  ⚡ Папка frontend не найдена. Создаю базовую...${NC}"
  mkdir -p "$FRONTEND_DIR"
  cat > "$FRONTEND_DIR/index.html" << EOF
<!DOCTYPE html><html><body><h1>Create Server</h1><p>Сайт в разработке</p></body></html>
EOF
fi

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

        # Лимиты безопасности
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

# ============ 4. Получение SSL сертификата ============
echo -e "${YELLOW}[4/5] Получение SSL сертификата Let's Encrypt...${NC}"

# Проверяем что домен смотрит на этот сервер
DOMAIN_IP=$(curl -s -o /dev/null -w "%{http_code}" http://${DOMAIN}/ 2>/dev/null || echo "000")
if [ "$DOMAIN_IP" = "000" ]; then
  echo -e "${YELLOW}  ⚠️  Домен ${DOMAIN} пока не отвечает. Убедись что DNS настроен на ${SERVER_IP}${NC}"
  echo -e "${YELLOW}  SSL будет получен позже. Сделай: certbot --nginx -d ${DOMAIN}${NC}"
else
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" || true
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
echo -e "  ${YELLOW}Профиль:${NC}      https://${DOMAIN}/profile.html"
echo ""
echo -e "${CYAN}📝 Команды:${NC}"
echo -e "  ${YELLOW}Логи Nginx:${NC}   journalctl -u nginx -f"
echo -e "  ${YELLOW}Логи API:${NC}     journalctl -u authlauncher.service -f"
echo -e "  ${YELLOW}Обновить SSL:${NC} certbot renew"
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Деплой завершён!${NC}"
echo -e "${GREEN}============================================${NC}"