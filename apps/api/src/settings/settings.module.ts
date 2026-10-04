import { Module } from '@nestjs/common';

import { RetentionService } from './retention.service';
import { SettingsController } from './settings.controller';
import { SmsKeywordService } from './sms-keyword.service';
import { SmsKeywordsController } from './sms-keywords.controller';

@Module({
  controllers: [SettingsController, SmsKeywordsController],
  providers: [RetentionService, SmsKeywordService],
  exports: [RetentionService, SmsKeywordService],
})
export class SettingsModule {}
