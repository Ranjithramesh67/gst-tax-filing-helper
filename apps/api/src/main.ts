import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: false, rawBody: true });

  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
  });

  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  Logger.log(`GSTFlow API listening on http://0.0.0.0:${port}/v1`, 'Bootstrap');
}

void bootstrap();
