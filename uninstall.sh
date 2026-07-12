#!/bin/bash
# ============================================
# AuthLauncher Uninstaller
# Полное удаление: сервис, БД, файлы
#   sudo curl -O https://raw.githubusercontent.com/xotiks/auth-launcher/main/uninstall.sh
#   sudo bash uninstall.sh
#
# Или без скачивания:
#   sudo ./installer.sh --remove
# ============================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# Определяем реального пользователя
if [ -n "$SUDO_USER" ]; then
  REAL_USER="$SUDO_USER"
else
  REAL_USER="$USER"
fi

FORCE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --force) FORCE=true; shift ;;
    --help)
      echo -e "${CYAN}Использование:${NC}"
      echo "  sudo bash uninstall.sh [--force]"
      echo "  --force  Без подтверждения"
      exit 0
      ;;
    *) shift ;;
  esac
done

echo -e "${RED}============================================${NC}"
echo -e "${RED}  AuthLauncher Uninstaller${NC}"
echo -e "${RED}============================================${NC}"
echo ""

PROJECT_DIR=$(pwd)
DB_NAME="auth_launcher"

# Читаем имя БД из .env если есть
if [ -f .env ]; then
  ENV_DB=$(grep 'DATABASE_URL' .env | grep -oP '/\K[^/]+(?=\?)' | tail -1)
  [ -n "$ENV_DB" ] && DB_NAME="$ENV_DB"
fi

# === Подтверждение ===
if [ "$FORCE" != "true" ]; then
  echo -e "${YELLOW}ВНИМАНИЕ: Это полностью удалит AuthLauncher с сервера!${NC}"
  echo -e "${YELLOW}Будут удалены: systemd сервис, PostgreSQL БД, файлы проекта${NC}"
  echo ""
  read -p "Продолжить? (y/N): " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo -e "${GREEN}Отменено.${NC}"
    exit 0
  fi

  echo ""
  read -p "Сохранить базу данных PostgreSQL? (y/N): " KEEP_DB
else
  KEEP_DB="n"
fi

echo ""
echo -e "${YELLOW}[1/4] Остановка сервиса...${NC}"
systemctl stop authlauncher.service 2>/dev/null || true
systemctl disable authlauncher.service 2>/dev/null || true
echo -e "${GREEN}  ✅ Сервис остановлен${NC}"

echo -e "${YELLOW}[2/4] Удаление systemd сервиса...${NC}"
rm -f /etc/systemd/system/authlauncher.service
systemctl daemon-reload
echo -e "${GREEN}  ✅ Сервис удалён${NC}"

if [[ "$KEEP_DB" != "y" && "$KEEP_DB" != "Y" ]]; then
  echo -e "${YELLOW}[3/4] Удаление базы данных PostgreSQL...${NC}"
  su - postgres -c "psql -c \"DROP DATABASE IF EXISTS ${DB_NAME};\"" 2>/dev/null || true
  su - postgres -c "psql -c \"DROP OWNED BY auth_user;\"" 2>/dev/null || true
  su - postgres -c "psql -c \"DROP USER IF EXISTS auth_user;\"" 2>/dev/null || true
  echo -e "${GREEN}  ✅ База данных и пользователь удалены${NC}"
else
  echo -e "${YELLOW}[3/4] База данных сохранена${NC}"
fi

echo -e "${YELLOW}[4/4] Удаление Nginx конфигурации...${NC}"
rm -f /etc/nginx/sites-available/authlauncher
rm -f /etc/nginx/sites-enabled/authlauncher
systemctl reload nginx 2>/dev/null || true
echo -e "${GREEN}  ✅ Nginx конфигурация удалена${NC}"

echo ""
echo -e "${YELLOW}Файлы проекта в ${PROJECT_DIR} — удалить их?${NC}"
read -p "Удалить все файлы проекта? (y/N): " DELETE_FILES
if [[ "$DELETE_FILES" == "y" || "$DELETE_FILES" == "Y" ]]; then
  echo -e "${YELLOW}  Удаление файлов...${NC}"
  # Возвращаем владельца чтобы можно было удалить
  chown -R $REAL_USER:$REAL_USER "$PROJECT_DIR" 2>/dev/null || true
  cd ..
  rm -rf "$PROJECT_DIR"
  echo -e "${GREEN}  ✅ Файлы удалены${NC}"
else
  echo -e "${GREEN}  ⚡ Файлы сохранены: ${PROJECT_DIR}${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  AuthLauncher полностью удалён${NC}"
echo -e "${GREEN}============================================${NC}"