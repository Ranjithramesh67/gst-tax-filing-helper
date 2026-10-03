import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '@gstflow/types';
import type { AppRelease, AuditLog, Firm, Paginated, User } from '@gstflow/types';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { parsePagination, paginate, type PaginationSlice } from '../common/pagination';
import { assertSlugAllowed } from '../common/slug';
import {
  serialiseAudit,
  serialiseFirm,
  serialiseRelease,
  serialiseUser,
} from '../common/serializers';
import type { Actor } from '../common/auth/actor.types';
import type {
  CreateFirmInput,
  CreateReleaseInput,
  CreateUserInput,
  ListAuditQuery,
  ListFirmsQuery,
  ListReleasesQuery,
  ListUsersQuery,
  UpdateFirmInput,
  UpdateUserInput,
} from './dto';

const FIRM_SELECT = {
  _count: { select: { clients: true, users: true } },
} satisfies Prisma.FirmInclude;

const USER_INCLUDE = {
  firm: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserInclude;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private slice(query: { page?: number; pageSize?: number }): PaginationSlice {
    return parsePagination({ page: query.page, pageSize: query.pageSize });
  }

  private async requireFirm(id: string): Promise<void> {
    const firm = await this.prisma.firm.findUnique({ where: { id }, select: { id: true } });
    if (!firm) throw new NotFoundException('Firm not found');
  }

  private async requireUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
  }

  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base.length > 0 ? base.slice(0, 60) : 'firm';
  }

  private async uniqueSlug(base: string): Promise<string> {
    const normalised = base.length > 0 ? base : 'firm';
    let slug = normalised.slice(0, 60);
    let counter = 2;
    while (await this.prisma.firm.findUnique({ where: { slug }, select: { id: true } })) {
      const suffix = `-${counter}`;
      slug = `${normalised.slice(0, 60 - suffix.length)}${suffix}`;
      counter += 1;
    }
    return slug;
  }

  async listFirms(query: ListFirmsQuery): Promise<Paginated<Firm>> {
    const slice = this.slice(query);
    const where: Prisma.FirmWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { gstin: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.firm.findMany({
        where,
        include: FIRM_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.firm.count({ where }),
    ]);
    return paginate(rows.map((row) => serialiseFirm(row)), total, slice);
  }

  async createFirm(input: CreateFirmInput, actor: Actor): Promise<Firm> {
    const slug = await this.uniqueSlug(input.slug ?? this.slugify(input.name));
    assertSlugAllowed(slug);
    const firm = await this.prisma.firm.create({
      data: {
        name: input.name,
        slug,
        gstin: input.gstin ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        logoUrl: input.logoUrl ?? null,
        brandColor: input.brandColor ?? null,
        supportEmail: input.supportEmail ?? null,
        supportPhone: input.supportPhone ?? null,
        address: input.address ?? null,
        defaultFilingFee: input.defaultFilingFee ?? null,
      },
    });
    await this.audit.recordAs(actor, {
      action: 'firm.create',
      entity: 'Firm',
      entityId: firm.id,
      meta: { name: firm.name, slug: firm.slug },
    });
    return serialiseFirm(firm);
  }

  async updateFirm(id: string, input: UpdateFirmInput, actor: Actor): Promise<Firm> {
    await this.requireFirm(id);
    let slug: string | undefined;
    if (input.slug !== undefined) {
      assertSlugAllowed(input.slug);
      const existing = await this.prisma.firm.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('That path is already in use by another firm');
      }
      slug = input.slug;
    }
    const firm = await this.prisma.firm.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.brandColor !== undefined ? { brandColor: input.brandColor } : {}),
        ...(input.supportEmail !== undefined ? { supportEmail: input.supportEmail } : {}),
        ...(input.supportPhone !== undefined ? { supportPhone: input.supportPhone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.defaultFilingFee !== undefined
          ? { defaultFilingFee: input.defaultFilingFee }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await this.audit.recordAs(actor, {
      action: 'firm.update',
      entity: 'Firm',
      entityId: firm.id,
      meta: { ...input },
    });
    return serialiseFirm(firm);
  }

  async getFirm(id: string): Promise<Firm> {
    const firm = await this.prisma.firm.findUnique({ where: { id }, include: FIRM_SELECT });
    if (!firm) throw new NotFoundException('Firm not found');
    return serialiseFirm(firm);
  }

  async listUsers(query: ListUsersQuery): Promise<Paginated<User>> {
    const slice = this.slice(query);
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.firmId) where.firmId = query.firmId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: USER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(rows.map((row) => serialiseUser(row)), total, slice);
  }

  async createUser(input: CreateUserInput, actor: Actor): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user
      .create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          role: input.role,
          firmId: input.firmId ?? null,
          passwordHash,
        },
        include: USER_INCLUDE,
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('A user with this email already exists');
        }
        throw error;
      });
    await this.audit.recordAs(actor, {
      action: 'user.create',
      entity: 'User',
      entityId: user.id,
      meta: { email: user.email, role: user.role, firmId: user.firmId },
    });
    return serialiseUser(user);
  }

  async updateUser(id: string, input: UpdateUserInput, actor: Actor): Promise<User> {
    await this.requireUser(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: USER_INCLUDE,
    });
    await this.audit.recordAs(actor, {
      action: 'user.update',
      entity: 'User',
      entityId: user.id,
      meta: { ...input },
    });
    return serialiseUser(user);
  }

  async listReleases(query: ListReleasesQuery): Promise<Paginated<AppRelease>> {
    const slice = this.slice(query);
    const where: Prisma.AppReleaseWhereInput = {};
    if (query.platform) where.platform = query.platform;
    if (query.channel) where.channel = query.channel;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.appRelease.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.appRelease.count({ where }),
    ]);
    return paginate(rows.map((row) => serialiseRelease(row)), total, slice);
  }

  async createRelease(input: CreateReleaseInput, actor: Actor): Promise<AppRelease> {
    const release = await this.prisma.appRelease.create({
      data: {
        platform: input.platform,
        version: input.version,
        versionCode: input.versionCode,
        channel: input.channel,
        url: input.url,
        checksum: input.checksum ?? null,
        changelog: input.changelog ?? null,
        mandatory: input.mandatory ?? false,
      },
    });
    await this.audit.recordAs(actor, {
      action: 'release.create',
      entity: 'AppRelease',
      entityId: release.id,
      meta: {
        platform: release.platform,
        version: release.version,
        channel: release.channel,
      },
    });
    return serialiseRelease(release);
  }

  async listAudit(query: ListAuditQuery, actor: Actor): Promise<Paginated<AuditLog>> {
    const slice = this.slice(query);
    const where: Prisma.AuditLogWhereInput = {};
    if (actor.role === Role.SUPER_ADMIN) {
      if (query.firmId) where.firmId = query.firmId;
    } else {
      where.firmId = actor.firmId;
    }
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(rows.map((row) => serialiseAudit(row)), total, slice);
  }
}
