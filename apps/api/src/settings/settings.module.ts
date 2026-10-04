import { Module } from '@nestjs/common';

import { RetentionService } from './retention.service';
import { SettingsController } from './settings.controller';

@Module({
  controllers: [SettingsController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class SettingsModule {}
