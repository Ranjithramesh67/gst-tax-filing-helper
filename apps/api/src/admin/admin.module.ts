import { Module } from '@nestjs/common';

import { AdminService } from './admin.service';
import { FirmsController } from './firms.controller';
import { UsersController } from './users.controller';
import { ReleasesController } from './releases.controller';
import { AuditController } from './audit.controller';
import { SmsProvidersController } from './sms-providers.controller';

@Module({
  controllers: [
    FirmsController,
    UsersController,
    ReleasesController,
    AuditController,
    SmsProvidersController,
  ],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
