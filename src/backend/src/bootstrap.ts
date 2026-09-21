import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { type Express } from 'express';
import { AppModule } from './app.module.js';
import { ResponseEnvelopeInterceptor } from './presentation/common/interceptors/response-envelope.interceptor.js';
import { DomainExceptionFilter } from './presentation/filters/domain-exception.filter.js';

function resolveCorsOrigins(config: ConfigService): string[] {
  const configured = config.get<string[]>('corsOrigins') ?? [];
  const frontendUrl = (config.get<string>('frontendUrl') ?? '')
    .trim()
    .replace(/\/$/, '');
  const origins = new Set(
    configured.map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
  );
  if (frontendUrl) origins.add(frontendUrl);
  // Production storefront (safe default if Vercel env is incomplete)
  origins.add('https://thread-nform-txkk.vercel.app');
  return [...origins];
}

function attachAuthRedirectPages(
  expressApp: Express,
  frontendUrl: string,
) {
  const target = `${frontendUrl.replace(/\/$/, '')}/auth/callback`;
  const redirectHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Thread N Form</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f7f5f0;color:#141414}
    .card{max-width:24rem;padding:2rem;text-align:center}
    h1{font-size:1.5rem;letter-spacing:-0.03em;margin:0 0 .75rem}
    p{color:#666;font-size:.95rem;line-height:1.5}
  </style>
</head>
<body>
  <div class="card">
    <h1>Thread N Form</h1>
    <p>Finishing your confirmation…</p>
  </div>
  <script>
    (function () {
      var target = ${JSON.stringify(target)};
      var hash = window.location.hash || '';
      var search = window.location.search || '';
      window.location.replace(target + search + hash);
    })();
  </script>
</body>
</html>`;

  expressApp.get('/', (_req, res) => {
    res.type('html').send(redirectHtml);
  });
  expressApp.get('/auth/callback', (_req, res) => {
    res.type('html').send(redirectHtml);
  });
}

export async function createNestApp(
  expressApp: Express = express(),
): Promise<{ app: INestApplication; expressApp: Express }> {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    { bodyParser: true },
  );
  const config = app.get(ConfigService);

  const prefix = config.get<string>('apiPrefix') ?? 'api/v1';
  app.setGlobalPrefix(prefix);

  const origins = resolveCorsOrigins(config);
  const allowAll = origins.includes('*');
  app.enableCors({
    origin: allowAll
      ? true
      : (
          origin: string | undefined,
          callback: (err: Error | null, allow?: boolean) => void,
        ) => {
          // Never throw from this callback — a thrown Error yields bare 500s
          // without Access-Control-* headers (browser reports a CORS failure).
          if (!origin) {
            callback(null, true);
            return;
          }
          const normalized = origin.replace(/\/$/, '');
          const isLocalhost =
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized);
          if (origins.includes(normalized) || isLocalhost) {
            callback(null, true);
            return;
          }
          callback(null, false);
        },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Guest-Token',
      'Accept',
    ],
    exposedHeaders: ['Idempotency-Key'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fareya Commerce API')
    .setDescription('UK fashion e-commerce backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
  });

  const frontendUrl =
    config.get<string>('frontendUrl') ?? 'http://localhost:3001';
  attachAuthRedirectPages(expressApp, frontendUrl);

  await app.init();
  return { app, expressApp };
}
