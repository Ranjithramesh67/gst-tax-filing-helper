import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';

import { StorageModule } from '../storage/storage.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

function documentsMulterOptions(config: ConfigService) {
  const mb = Number(config.get<string>('MAX_UPLOAD_MB') ?? 25);
  const maxMb = Number.isFinite(mb) && mb > 0 ? mb : 25;
  return { limits: { fileSize: maxMb * 1024 * 1024 } };
}

@Module({
  imports: [
    StorageModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: documentsMulterOptions,
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
