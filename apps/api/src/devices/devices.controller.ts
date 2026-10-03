import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type { Device } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { type Actor } from '../common/auth/actor.types';
import { DevicesService } from './devices.service';
import {
  deviceRegisterBodySchema,
  listDevicesQuerySchema,
  type DeviceRegisterBodyInput,
  type ListDevicesQuery,
} from './dto';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermissions('devices:read')
  async list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(listDevicesQuerySchema)) query: ListDevicesQuery,
  ): Promise<Device[]> {
    return this.devices.list(actor, query);
  }

  @Get(':id')
  @RequirePermissions('devices:read')
  async get(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<Device> {
    return this.devices.get(actor, id);
  }

  @Roles(Role.CLIENT)
  @RequirePermissions('devices:manage')
  @Post('register')
  async register(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(deviceRegisterBodySchema)) body: DeviceRegisterBodyInput,
  ): Promise<Device> {
    return this.devices.register(actor, body);
  }

  @Roles(Role.CLIENT)
  @RequirePermissions('devices:manage')
  @Post(':id/revoke')
  async revoke(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<Device> {
    return this.devices.revoke(actor, id);
  }

  @Roles(Role.CLIENT)
  @Post(':id/heartbeat')
  async heartbeat(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.devices.heartbeat(actor, id);
  }
}
