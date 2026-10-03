import { Module } from '@nestjs/common';

import { BillingController, PublicBillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { CashfreeService } from './cashfree.service';

@Module({
  controllers: [BillingController, PublicBillingController],
  providers: [BillingService, CashfreeService],
  exports: [BillingService, CashfreeService],
})
export class BillingModule {}
