import { Global, Module } from '@nestjs/common';
import { SmsGatewayService } from './sms-gateway.service';
import { SmsProviderConfigService } from './sms-provider-config.service';

@Global()
@Module({
  providers: [SmsGatewayService, SmsProviderConfigService],
  exports: [SmsGatewayService, SmsProviderConfigService],
})
export class SmsGatewayModule {}
