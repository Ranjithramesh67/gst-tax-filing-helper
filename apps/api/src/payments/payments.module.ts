import { Module } from '@nestjs/common';

import {
  BillingAdminController,
  FilingPaymentsController,
  PaymentsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController, FilingPaymentsController, BillingAdminController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
