import { Module } from '@nestjs/common';

import { OtpSettingsController } from './otp-settings.controller';
import { OtpSettingsService } from './otp-settings.service';
import { RetentionService } from './retention.service';
import { SettingsController } from './settings.controller';
import { SmsKeywordService } from './sms-keyword.service';
import { SmsKeywordsController } from './sms-keywords.controller';

@Module({
  controllers: [SettingsController, SmsKeywordsController, OtpSettingsController],
  providers: [RetentionService, SmsKeywordService, OtpSettingsService],
  exports: [RetentionService, SmsKeywordService, OtpSettingsService],
})
export class SettingsModule {}
