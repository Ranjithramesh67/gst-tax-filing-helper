import { Module } from '@nestjs/common';

import { InboxController } from './inbox.controller';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';

@Module({
  controllers: [OtpController, InboxController],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
