#!/bin/bash
# ============================================
# AuthLauncher Uninstaller
# Полное удаление: сервис, БД, файлы
#   curl -O https://raw.githubusercontent.com/xotiks/auth-launcher/main/uninstall.sh
#   bash uninstall.sh
# ============================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${RED}============================================${NC}"
echo -e "${RED}  AuthLauncher Uninstaller${NC}"
echo -e "${RED}============================================${NC}"
echo ""

# === Подтверждение ===
echo -e "${YELLOW}ВНИМАНИЕ: Это полностью удалит AuthLauncher с сервера!${NC}"
echo -e "${YELLOW}Будут удалены: systemd сервис, PostgreSQL БД, файлы проекта${NC}"
echo ""
read -p "Продолжить? (y/N): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo -e "${GREEN}Отменено.${NC}"
  exit 0
fi

# === Опция: сохранить БД ===
echo ""
read -p "Сохранить базу данных PostgreSQL? (y/N): " KEEP_DB

PROJECT_DIR=$(pwd)
DB_NAME="auth_launcher"

# Читаем имя БД из .env если есть
if [ -f .env ]; then
  ENV_DB=$(grep 'DATABASE_URL' .env | grep -oP '/\K[^/]+(?=\?)' | tail -1)
  [ -n "$ENV_DB" ] && DB_NAME="$ENV_DB"
fi

echo ""
echo -e "${YELLOW}[1/4] Остановка сервиса...${NC}"
sudo systemctl stop authlauncher.service 2>/dev/null || true
sudo systemctl disable authlauncher.service 2>/dev/null || true
echo -e "${GREEN}  ✅ Сервис остановлен${NC}"

echo -e "${YELLOW}[2/4] Удаление systemd сервиса...${NC}"
sudo rm -f /etc/systemd/system/authlauncher.service
sudo systemctl daemon-reload
echo -e "${GREEN}  ✅ Сервис удалён${NC}"

if [[ "$KEEP_DB" != "y" && "$KEEP_DB" != "Y" ]]; then
  echo -e "${YELLOW}[3/4] Удаление базы данных PostgreSQL...${NC}"
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || true
  sudo -u postgres psql -c "DROP OWNED BY auth_user;" 2>/dev/null || true
  sudo -u postgres psql -c "DROP USER IF EXISTS auth_user;" 2>/dev/null || true
  echo -e "${GREEN}  ✅ База данных удалена${NC}"
else
  echo -e "${YELLOW}[3/4] База данных сохранена (как просили)${NC}"
fi

echo -e "${YELLOW}[4/4] Удаление Nginx конфигурации...${NC}"
sudo rm -f /etc/nginx/sites-available/authlauncher
sudo rm -f /etc/nginx/sites-enabled/authlauncher
sudo systemctl reload nginx 2>/dev/null || true
echo -e "${GREEN}  ✅ Nginx конфигурация удалена${NC}"

echo ""
echo -e "${YELLOW}Файлы проекта не удалены. Хотите удалить и их?${NC}"
read -p "Удалить все файлы проекта? (y/N): " DELETE_FILES
if [[ "$DELETE_FILES" == "y" || "$DELETE_FILES" == "Y" ]]; then
  echo -e "${YELLOW}  Удаление файлов...${NC}"
  cd ..
  rm -rf "$PROJECT_DIR"
  echo -e "${GREEN}  ✅ Файлы удалены${NC}"
else
  echo -e "${GREEN}  ⚡ Файлы сохранены в ${PROJECT_DIR}${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  AuthLauncher полностью удалён${NC}"
echo -e "${GREEN}============================================${NC}"