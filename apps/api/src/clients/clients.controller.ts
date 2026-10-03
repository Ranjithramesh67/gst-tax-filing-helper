import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { Client, ConsentRecord, PaginatedClients } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
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

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermissions('clients:read')
  list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(listClientsQuerySchema)) query: ListClientsQueryDto,
  ): Promise<PaginatedClients> {
    return this.clients.list(actor, query);
  }

  @Post()
  @RequirePermissions('clients:write')
  create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createClientExtendedSchema)) body: CreateClientDto,
  ): Promise<Client> {
    return this.clients.create(actor, body);
  }

  @Get(':id')
  @RequirePermissions('clients:read')
  get(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<Client> {
    return this.clients.get(actor, id);
  }

  @Patch(':id')
  @RequirePermissions('clients:write')
  update(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientDto,
  ): Promise<Client> {
    return this.clients.update(actor, id, body);
  }

  @Delete(':id')
  @RequirePermissions('clients:delete')
  remove(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<{ success: boolean }> {
    return this.clients.archive(actor, id);
  }

  @Get(':id/consents')
  @RequirePermissions('clients:read')
  consents(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<ConsentRecord[]> {
    return this.clients.listConsents(actor, id);
  }

  @Post(':id/consents/revoke')
  @RequirePermissions('consents:manage')
  revokeConsents(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.clients.revokeConsents(actor, id);
  }
}
