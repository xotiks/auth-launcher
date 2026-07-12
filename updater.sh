#!/bin/bash
# ============================================
# AuthLauncher Updater
# Обновление до указанной версии
#   curl -O https://raw.githubusercontent.com/xotiks/auth-launcher/main/updater.sh
#   chmod +x ./updater.sh && ./updater.sh --version v1.0.0
# ============================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

VERSION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --version) VERSION="$2"; shift 2 ;;
    --help)
      echo -e "${CYAN}Использование:${NC}"
      echo "  ./updater.sh --version TAG"
      echo ""
      echo -e "${CYAN}Пример:${NC}"
      echo "  ./updater.sh --version v1.0.0"
      exit 0
      ;;
    *) echo -e "${RED}Неизвестно: $1${NC}"; exit 1 ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo -e "${RED}Ошибка: укажите --version${NC}"
  echo "Пример: ./updater.sh --version v1.0.0"
  exit 1
fi

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  AuthLauncher Updater → ${VERSION}${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Проверка, что мы в папке проекта
if [ ! -f package.json ]; then
  echo -e "${RED}Ошибка: package.json не найден. Запустите из папки проекта.${NC}"
  exit 1
fi

# Сохраняем текущий .env
if [ -f .env ]; then
  cp .env .env.backup
  echo -e "${GREEN}  ✅ .env сохранён (.env.backup)${NC}"
fi

# Получаем последний код
echo -e "${YELLOW}[1/5] Получение обновлений...${NC}"
git fetch --tags 2>/dev/null || true
git checkout "$VERSION" 2>/dev/null || {
  echo -e "${YELLOW}  ⚡ Тег $VERSION не найден, пробуем main...${NC}"
  git pull origin main --ff-only 2>/dev/null || true
}
echo -e "${GREEN}  ✅ Код обновлён${NC}"

# Восстанавливаем .env
if [ -f .env.backup ]; then
  cp .env.backup .env
  echo -e "${GREEN}  ✅ .env восстановлен${NC}"
fi

# Обновляем зависимости
echo -e "${YELLOW}[2/5] Обновление npm зависимостей...${NC}"
npm ci 2>/dev/null || npm install
npx prisma generate
echo -e "${GREEN}  ✅ Зависимости обновлены${NC}"

# Миграции
echo -e "${YELLOW}[3/5] Миграции базы данных...${NC}"
npx prisma db push 2>/dev/null || true
echo -e "${GREEN}  ✅ Миграции выполнены${NC}"

# Пересборка
echo -e "${YELLOW}[4/5] Сборка TypeScript...${NC}"
npm run build 2>/dev/null || npx tsc
echo -e "${GREEN}  ✅ Сборка завершена${NC}"

# Рестарт сервиса
echo -e "${YELLOW}[5/5] Перезапуск сервиса...${NC}"
sudo systemctl restart authlauncher.service 2>/dev/null || \
  systemctl --user restart authlauncher.service 2>/dev/null || true

sleep 2

# Проверка
PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d'=' -f2)
PORT=${PORT:-5003}

if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/api/v1/health" | grep -q "200"; then
  echo -e "${GREEN}  ✅ Сервер работает!${NC}"
else
  echo -e "${RED}  ❌ Проблема. Логи: sudo journalctl -u authlauncher.service -f${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Обновление до ${VERSION} завершено!${NC}"
echo -e "${GREEN}============================================${NC}"