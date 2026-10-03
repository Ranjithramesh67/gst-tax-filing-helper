import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuditModule } from './common/audit/audit.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { DevicesModule } from './devices/devices.module';
import { SmsModule } from './sms/sms.module';
import { DocumentsModule } from './documents/documents.module';
import { FilingsModule } from './filings/filings.module';
import { AdminModule } from './admin/admin.module';
import { PublicModule } from './public/public.module';
import { PaymentsModule } from './payments/payments.module';
import { BillingModule } from './billing/billing.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { JwtModule } from './common/jwt/jwt.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '../../.env')],
    }),
    JwtModule,
    PrismaModule,
    CryptoModule,
    AuditModule,
    HealthModule,
    AuthModule,
    ClientsModule,
    DevicesModule,
    SmsModule,
    DocumentsModule,
    FilingsModule,
    AdminModule,
    PublicModule,
    PaymentsModule,
    BillingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
