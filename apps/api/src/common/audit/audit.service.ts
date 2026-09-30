import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Actor } from '../auth/actor.types';

export interface AuditInput {
  actorId?: string | null;
  firmId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          firmId: input.firmId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          meta: (input.meta ?? undefined) as never,
          ip: input.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log for ${input.action}: ${String(error)}`);
    }
  }

  async recordAs(actor: Actor | undefined, input: Omit<AuditInput, 'actorId' | 'firmId'>): Promise<void> {
    await this.record({
      ...input,
      actorId: actor?.clientId ? null : actor?.userId ?? null,
      firmId: actor?.firmId ?? null,
      meta: {
        ...(input.meta ?? {}),
        ...(actor?.clientId ? { clientId: actor.clientId } : {}),
      },
    });
  }
}
