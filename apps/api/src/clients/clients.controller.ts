import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type { Client, ConsentRecord, PaginatedClients } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { ClientsService } from './clients.service';
import {
  createClientExtendedSchema,
  listClientsQuerySchema,
  updateClientSchema,
  type CreateClientDto,
  type ListClientsQueryDto,
  type UpdateClientDto,
} from './dto';

const STAFF_ROLES = [Role.SUPER_ADMIN, Role.FIRM_ADMIN, Role.FILER] as const;
const ADMIN_ROLES = [Role.SUPER_ADMIN, Role.FIRM_ADMIN] as const;

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Roles(...STAFF_ROLES)
  list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(listClientsQuerySchema)) query: ListClientsQueryDto,
  ): Promise<PaginatedClients> {
    return this.clients.list(actor, query);
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createClientExtendedSchema)) body: CreateClientDto,
  ): Promise<Client> {
    return this.clients.create(actor, body);
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  get(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<Client> {
    return this.clients.get(actor, id);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  update(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientDto,
  ): Promise<Client> {
    return this.clients.update(actor, id, body);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  remove(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<{ success: boolean }> {
    return this.clients.archive(actor, id);
  }

  @Get(':id/consents')
  @Roles(...STAFF_ROLES)
  consents(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<ConsentRecord[]> {
    return this.clients.listConsents(actor, id);
  }

  @Post(':id/consents/revoke')
  @Roles(Role.FIRM_ADMIN, Role.FILER)
  revokeConsents(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.clients.revokeConsents(actor, id);
  }
}
