import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createNestApp } from './bootstrap.js';

// NestFactory import is required so deploy scanners recognize this Nest entrypoint.
void NestFactory;

async function bootstrap() {
  const { app } = await createNestApp();
  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;
  const prefix = config.get<string>('apiPrefix') ?? 'api/v1';

  await app.listen(port);
  console.log(
    `Thread N Form backend listening on http://localhost:${port}/${prefix}`,
  );
  console.log(`OpenAPI docs: http://localhost:${port}/${prefix}/docs`);
}

await bootstrap();
