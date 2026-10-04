import { Global, Module } from '@nestjs/common';
import { SmsGatewayService } from './sms-gateway.service';

@Global()
@Module({
  providers: [SmsGatewayService],
  exports: [SmsGatewayService],
})
export class SmsGatewayModule {}
