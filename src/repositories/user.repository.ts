// Репозиторий пользователей
// Слой доступа к данным таблицы users
// Только Prisma запросы — никакой бизнес-логики

// UserStatus импортируется из Prisma, но в Prisma 6 используем string
import { prisma } from '../database/prisma';
import type {
  UserPublic,
  UserAdmin,
  LoginHistoryEntry,
} from '../types';

/**
 * Выборка публичных полей пользователя (без секретов)
 */
const publicUserSelect = {
  uuid: true,
  login: true,
  email: true,
  status: true,
  totpEnabled: true,
  lastLoginAt: true,
  lastLoginIp: true,
  lastLauncherVersion: true,
  createdAt: true,
} as const;

export const userRepository = {
  /**
   * Поиск пользователя по логину (регистронезависимый)
   */
  async findByLogin(login: string) {
    return prisma.user.findFirst({
      where: {
        login: {
          equals: login,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
      include: {
        role: true,
      },
    });
  },

  /**
   * Поиск пользователя по UUID
   */
  async findByUuid(uuid: string) {
    return prisma.user.findUnique({
      where: { uuid },
      include: {
        role: true,
        bans: {
          include: {
            admin: {
              select: { name: true },
            },
          },
        },
      },
    });
  },

  /**
   * Поиск пользователя по ID
   */
  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
      },
    });
  },

  /**
   * Создание нового пользователя
   */
  async create(data: {
    login: string;
    passwordHash: string;
    email?: string;
    roleId: string;
  }) {
    const user = await prisma.user.create({
      data: {
        login: data.login,
        passwordHash: data.passwordHash,
        email: data.email,
        roleId: data.roleId,
      },
      include: {
        role: true,
      },
    });
    return user;
  },

  /**
   * Обновление данных пользователя
   */
  async update(
    id: string,
    data: Record<string, unknown>
  ) {
    return prisma.user.update({
      where: { id },
      data,
      include: {
        role: true,
      },
    });
  },

  /**
   * Получение публичной информации о пользователе
   */
  async getPublicInfo(uuid: string): Promise<UserPublic | null> {
    const user = await prisma.user.findUnique({
      where: { uuid },
      select: {
        ...publicUserSelect,
        role: {
          select: { name: true },
        },
      },
    });

    if (!user) return null;

    return {
      ...user,
      roleName: user.role.name,
    };
  },

  /**
   * Получение полной информации для админа
   */
  async getAdminInfo(uuid: string): Promise<UserAdmin | null> {
    const user = await prisma.user.findUnique({
      where: { uuid },
      include: {
        role: true,
        bans: {
          include: {
            admin: {
              select: { name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      uuid: user.uuid,
      login: user.login,
      email: user.email,
      status: user.status as UserAdmin['status'],
      roleName: user.role.name,
      totpEnabled: user.totpEnabled,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      lastLauncherVersion: user.lastLauncherVersion,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
      bans: user.bans.map((ban: {
        id: string;
        reason: string | null;
        expiresAt: Date | null;
        createdAt: Date;
        admin: { name: string };
      }) => ({
        id: ban.id,
        reason: ban.reason,
        expiresAt: ban.expiresAt,
        createdAt: ban.createdAt,
        adminLogin: ban.admin.name,
      })),
    };
  },

  /**
   * Получение списка пользователей (для админа)
   */
  async getUsersList(
    page: number,
    limit: number,
    filters?: {
      status?: string;
      search?: string;
    }
  ) {
    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.OR = [
        { login: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          ...publicUserSelect,
          id: true,
          failedLoginAttempts: true,
          lockedUntil: true,
          updatedAt: true,
          role: {
            select: { name: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user: { role: { name: string } } & Record<string, unknown>) => ({
        ...user,
        roleName: user.role.name,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Получение истории входов пользователя
   */
  async getLoginHistory(
    userId: string,
    page: number,
    limit: number
  ): Promise<{
    items: LoginHistoryEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const where = { userId };

    const [history, total] = await Promise.all([
      prisma.loginHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.loginHistory.count({ where }),
    ]);

    return {
      items: history.map((entry: {
        id: string;
        ip: string;
        userAgent: string | null;
        country: string | null;
        success: boolean;
        failureReason: string | null;
        createdAt: Date;
      }) => ({
        id: entry.id,
        ip: entry.ip,
        userAgent: entry.userAgent,
        country: entry.country,
        success: entry.success,
        failureReason: entry.failureReason,
        createdAt: entry.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Создание записи в истории входов
   */
  async createLoginHistory(data: {
    userId?: string;
    ip: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
  }) {
    return prisma.loginHistory.create({
      data: {
        userId: data.userId,
        ip: data.ip,
        userAgent: data.userAgent,
        success: data.success,
        failureReason: data.failureReason,
      },
    });
  },

  /**
   * Проверка существования пользователя по логину (для регистрации)
   */
  async existsByLogin(login: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: {
        login: {
          equals: login,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
      select: { id: true },
    });
    return user !== null;
  },

  /**
   * Проверка существования пользователя по email
   */
  async existsByEmail(email: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
      select: { id: true },
    });
    return user !== null;
  },

  /**
   * Мягкое удаление пользователя
   */
  async softDelete(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        login: `deleted_${Date.now()}_${id.slice(0, 8)}`,
      },
    });
  },
};