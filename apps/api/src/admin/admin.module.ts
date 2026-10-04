import { Module } from '@nestjs/common';

import { AdminService } from './admin.service';
import { AdminSmsService } from './admin-sms.service';
import { FirmsController } from './firms.controller';
import { UsersController } from './users.controller';
import { ReleasesController } from './releases.controller';
import { AuditController } from './audit.controller';
import { SmsProvidersController } from './sms-providers.controller';
import { AdminSmsController } from './sms-messages.controller';

@Module({
  controllers: [
    FirmsController,
    UsersController,
    ReleasesController,
    AuditController,
    SmsProvidersController,
    AdminSmsController,
  ],
  providers: [AdminService, AdminSmsService],
  exports: [AdminService],
})
export class AdminModule {}
