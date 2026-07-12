// Скрипт инициализации базы данных
// Создаёт роли и администратора по умолчанию
// Запуск: npm run seed

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Конфигурация ролей по умолчанию
 */
const DEFAULT_ROLES = [
  {
    name: 'ADMIN',
    description: 'Администратор системы — полный доступ ко всем функциям',
    permissions: [
      'users.read',
      'users.write',
      'users.delete',
      'users.ban',
      'users.unban',
      'users.role.change',
      'users.history.read',
      'settings.read',
      'settings.write',
      'audit.read',
    ],
  },
  {
    name: 'USER',
    description: 'Обычный пользователь — базовые функции аккаунта',
    permissions: [
      'profile.read',
      'profile.write',
      'auth.login',
    ],
  },
  {
    name: 'MODERATOR',
    description: 'Модератор — может просматривать пользователей и историю',
    permissions: [
      'users.read',
      'users.history.read',
      'profile.read',
    ],
  },
];

async function seed(): Promise<void> {
  console.log('🌱 Начинаем инициализацию базы данных...');

  try {
    // === Создание ролей ===
    console.log('📋 Создание ролей...');

    for (const roleData of DEFAULT_ROLES) {
      const existingRole = await prisma.role.findUnique({
        where: { name: roleData.name },
      });

      if (existingRole) {
        console.log(`  ⚡ Роль "${roleData.name}" уже существует`);
        continue;
      }

      await prisma.role.create({
        data: roleData,
      });

      console.log(`  ✅ Роль "${roleData.name}" создана`);
    }

    // === Создание администратора ===
    console.log('👤 Создание администратора...');

    const adminLogin = process.env.ADMIN_LOGIN || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123456!';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';

    const existingAdmin = await prisma.user.findFirst({
      where: {
        login: {
          equals: adminLogin,
          mode: 'insensitive',
        },
      },
    });

    if (existingAdmin) {
      console.log(`  ⚡ Администратор "${adminLogin}" уже существует`);
    } else {
      const adminRole = await prisma.role.findUnique({
        where: { name: 'ADMIN' },
      });

      if (!adminRole) {
        throw new Error('Роль ADMIN не найдена');
      }

      // Хешируем пароль через Argon2id
      const passwordHash = await argon2.hash(adminPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 2,
        hashLength: 32,
      });

      await prisma.user.create({
        data: {
          login: adminLogin,
          email: adminEmail,
          passwordHash,
          roleId: adminRole.id,
        },
      });

      console.log(`  ✅ Администратор "${adminLogin}" создан`);
      console.log(`  ⚠️  Обязательно смените пароль после первого входа!`);
    }

    console.log('✅ Инициализация базы данных завершена успешно');
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();