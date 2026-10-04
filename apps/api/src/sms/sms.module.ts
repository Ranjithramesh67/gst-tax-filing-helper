import { Module } from '@nestjs/common';

import { FilingsModule } from '../filings/filings.module';
import { OtpModule } from '../otp/otp.module';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';

@Module({
  imports: [FilingsModule, OtpModule],
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
