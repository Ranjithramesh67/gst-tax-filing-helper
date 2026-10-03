import { Module } from '@nestjs/common';

import { RbacService } from './rbac.service';
import { AdminRbacController } from './admin-roles.controller';
import { FirmRbacController } from './firm-rbac.controller';

@Module({
  controllers: [AdminRbacController, FirmRbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
