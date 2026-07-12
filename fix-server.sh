#!/bin/bash
# ============================================
# Фикс сервера AuthLauncher на digmasrv
# Запуск: bash fix-server.sh
# ============================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}🔧 Поиск проекта AuthLauncher...${NC}"

# Ищем папку с package.json и node_modules
POSSIBLE_DIRS=(
  "$HOME/AuthLauncher"
  "$HOME/auth-launcher"
  "$HOME/auth_launcher"
  "$PWD"
)

PROJECT_DIR=""
for dir in "${POSSIBLE_DIRS[@]}"; do
  if [ -f "$dir/package.json" ] && [ -f "$dir/.env" ]; then
    PROJECT_DIR="$dir"
    break
  fi
done

if [ -z "$PROJECT_DIR" ]; then
  # Поиск по всей домашней папке
  PROJECT_DIR=$(find "$HOME" -maxdepth 3 -name "package.json" -path "*/node_modules" -prune -o -print 2>/dev/null | head -1 | xargs dirname 2>/dev/null)
fi

if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo -e "${RED}❌ Проект не найден!${NC}"
  echo -e "${YELLOW}Где находится папка с проектом? Введи путь:${NC}"
  read -r PROJECT_DIR
fi

echo -e "${GREEN}✅ Проект найден: ${PROJECT_DIR}${NC}"

# Проверяем node_modules
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo -e "${YELLOW}📦 Установка зависимостей...${NC}"
  cd "$PROJECT_DIR"
  npm config set registry https://registry.npmmirror.com
  npm install
  npx prisma generate
  npx prisma db push
  npm run seed
fi

# Удаляем старый сервис
echo -e "${YELLOW}🛠 Настройка systemd сервиса...${NC}"
sudo systemctl stop authlauncher.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/authlauncher.service

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
ExecStart=${NODE_PATH} ${PROJECT_DIR}/node_modules/.bin/tsx src/index.ts
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

echo -e "${GREEN}✅ Сервис запущен${NC}"

# Ждём и проверяем
sleep 3

echo ""
echo -e "${CYAN}📋 Логи сервера:${NC}"
sudo journalctl -u authlauncher.service -n 15 --no-pager

echo ""
echo -e "${CYAN}🔍 Проверка health:${NC}"
curl -s http://localhost:3419/api/v1/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3419/api/v1/health

echo ""
echo -e "${CYAN}👤 Админ:${NC}"
grep "ADMIN_LOGIN\|ADMIN_PASSWORD" "$PROJECT_DIR/.env" 2>/dev/null

echo ""
echo -e "${GREEN}✅ Готово!${NC}"
echo -e "${YELLOW}API:${NC} http://localhost:3419/api/v1"
echo -e "${YELLOW}Логи:${NC} sudo journalctl -u authlauncher.service -f"