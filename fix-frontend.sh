#!/bin/bash
# Фикс: копирование фронтенда и SSL на сервере digmasrv
# Запуск: bash fix-frontend.sh
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# === ШАГ 1: Найти где лежит фронтенд ===
echo -e "${YELLOW}🔍 Поиск папки frontend...${NC}"
FRONTEND_SRC=$(find /home/digmasrv -type d -name "frontend" -not -path "*/node_modules/*" 2>/dev/null | head -1)

if [ -z "$FRONTEND_SRC" ]; then
  echo -e "${RED}❌ Папка frontend не найдена!${NC}"
  echo -e "${YELLOW}Покажи что выводит: ls ~/${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Фронтенд найден: ${FRONTEND_SRC}${NC}"

# === ШАГ 2: Копировать ===
echo -e "${YELLOW}📂 Копирование в /var/www/prshield...${NC}"
sudo mkdir -p /var/www/prshield
sudo cp -r "$FRONTEND_SRC"/* /var/www/prshield/
sudo chown -R www-data:www-data /var/www/prshield
echo -e "${GREEN}✅ Фронтенд скопирован${NC}"

# === ШАГ 3: Проверить DNS ===
echo ""
echo -e "${YELLOW}🔍 Проверка DNS для prshield.serp-hub.ru...${NC}"
DNS_IP=$(nslookup prshield.serp-hub.ru 2>/dev/null | grep -oP 'Address: \K[0-9.]+' | tail -1)

if [ "$DNS_IP" = "80.254.102.229" ]; then
  echo -e "${GREEN}✅ DNS настроен правильно: ${DNS_IP}${NC}"
  echo ""
  echo -e "${YELLOW}🚀 Получаем SSL сертификат...${NC}"
  sudo certbot --nginx -d prshield.serp-hub.ru --non-interactive --agree-tos --email vovnazr567@gmail.com
  echo -e "${GREEN}✅ SSL получен!${NC}"

  echo ""
  echo -e "${GREEN}============================================${NC}"
  echo -e "${GREEN}  Сайт работает: https://prshield.serp-hub.ru${NC}"
  echo -e "${GREEN}  API: https://prshield.serp-hub.ru/api/v1/health${NC}"
  echo -e "${GREEN}============================================${NC}"
else
  echo -e "${RED}❌ DNS смотрит на ${DNS_IP:-НЕТ ЗАПИСИ}, нужно на 80.254.102.229${NC}"
  echo ""
  echo -e "${YELLOW}⚠️  Добавь A-запись в DNS:${NC}"
  echo -e "    ${YELLOW}prshield.serp-hub.ru → A → 80.254.102.229${NC}"
  echo ""
  echo -e "${YELLOW}После этого запусти:${NC}"
  echo -e "    sudo certbot --nginx -d prshield.serp-hub.ru --non-interactive --agree-tos --email vovnazr567@gmail.com"
fi

echo ""
echo -e "${GREEN}✅ Фронтенд скопирован! Сайт доступен по HTTP на http://80.254.102.229/${NC}"