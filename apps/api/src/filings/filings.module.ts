import { Module } from '@nestjs/common';
import { FilingsService } from './filings.service';
import { InvoicesController } from './invoices.controller';
import { ReturnsController } from './returns.controller';
import { FilingsController } from './filings.controller';

@Module({
  controllers: [InvoicesController, ReturnsController, FilingsController],
  providers: [FilingsService],
  exports: [FilingsService],
})
export class FilingsModule {}
