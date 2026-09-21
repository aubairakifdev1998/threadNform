import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ResponseEnvelopeInterceptor } from '../src/presentation/common/interceptors/response-envelope.interceptor.js';
import { DomainExceptionFilter } from '../src/presentation/filters/domain-exception.filter.js';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(() => {
    process.env.SUPABASE_URL ??= 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key';
    process.env.SUPABASE_SECRET_KEY ??= 'test-secret-key';
    process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
  });

  it('/api/v1/health (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
  });

  afterEach(async () => {
    await app.close();
  });
});
