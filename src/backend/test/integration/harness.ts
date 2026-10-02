/**
 * Boots the compiled Nest app (dist/) against the integration database with
 * Supabase Auth, Storage and email replaced by in-memory fakes. Everything
 * else — controllers, use cases, repositories, SQL functions — is real.
 *
 * Auth tokens: `test:<userId>:<email>` (see `tokenFor`).
 */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';

const dist = (path: string) =>
  import(pathToFileURL(resolve(import.meta.dirname, '../../dist', path)).href);

export type Harness = {
  app: INestApplication;
  db: pg.Pool;
  http: () => ReturnType<typeof request>;
  storage: Map<string, Buffer>;
  sentEmails: Array<{ event: string; to: string }>;
  /** Set failuresLeft > 0 to make the next N email sends fail. */
  mailer: { failuresLeft: number };
  close: () => Promise<void>;
};

export const API = '/api/v1';

export async function createHarness(
  options: { rateLimit?: boolean } = {},
): Promise<Harness> {
  const databaseUrl = process.env.INTEGRATION_DATABASE_URL!;
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    SUPABASE_URL: 'http://supabase.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
    SUPABASE_SECRET_KEY: 'test-secret',
    CART_TOKEN_SECRET: 'integration-cart-secret-0123456789abcdef',
    CRON_SECRET: 'integration-cron-secret',
    CORS_ORIGINS: 'http://localhost:3001',
    // Suites hammer one IP; only the rate-limit suite turns limits on.
    RATE_LIMIT_ENABLED: options.rateLimit ? 'true' : 'false',
  });

  const [
    { AppModule },
    { configureApp },
    authPort,
    storagePort,
    notifyPort,
    userEntity,
    storedFile,
    exceptions,
  ] = await Promise.all([
    dist('app.module.js'),
    dist('bootstrap.js'),
    dist('domain/repositories/auth.repository.js'),
    dist('domain/repositories/storage.repository.js'),
    dist('domain/notifications/notification.port.js'),
    dist('domain/entities/user.entity.js'),
    dist('domain/entities/stored-file.entity.js'),
    dist('domain/exceptions/domain.exception.js'),
  ]);

  const storage = new Map<string, Buffer>();
  const sentEmails: Array<{ event: string; to: string }> = [];
  const mailer = { failuresLeft: 0 };

  const fakeAuth = {
    async getUserFromToken(token: string) {
      const [scheme, id, email] = token.split(':');
      if (scheme !== 'test' || !id || !email) {
        throw new exceptions.UnauthorizedException('Invalid or expired token');
      }
      return new userEntity.User(id, email, null, null, new Date(), new Date());
    },
  };
  const fakeStorage = {
    async upload(input: {
      bucket: string;
      path: string;
      body: Buffer;
      contentType: string;
    }) {
      storage.set(`${input.bucket}/${input.path}`, input.body);
      return new storedFile.StoredFile(
        input.path,
        input.bucket,
        null,
        input.body.length,
        input.contentType,
      );
    },
    async getPublicUrl(bucket: string, path: string) {
      return `http://storage.test/${bucket}/${path}`;
    },
    async createSignedUrl(bucket: string, path: string) {
      return `http://storage.test/signed/${bucket}/${path}`;
    },
    async exists(bucket: string, path: string) {
      return storage.has(`${bucket}/${path}`);
    },
    async delete(bucket: string, paths: string[]) {
      for (const p of paths) storage.delete(`${bucket}/${p}`);
    },
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(authPort.AUTH_REPOSITORY)
    .useValue(fakeAuth)
    .overrideProvider(storagePort.STORAGE_REPOSITORY)
    .useValue(fakeStorage)
    .overrideProvider(notifyPort.NOTIFICATION_PORT)
    .useValue({
      async send(payload: { event: string; to: string }) {
        if (mailer.failuresLeft > 0) {
          mailer.failuresLeft -= 1;
          throw new Error('SMTP unavailable (simulated)');
        }
        sentEmails.push({ event: payload.event, to: payload.to });
      },
    })
    .compile();

  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  // A real listening socket: concurrency tests open many parallel connections.
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();

  const db = new pg.Pool({ connectionString: databaseUrl, max: 4 });

  return {
    app,
    db,
    http: () => request(baseUrl),
    storage,
    sentEmails,
    mailer,
    close: async () => {
      await app.close();
      await db.end();
    },
  };
}

export function tokenFor(user: { id: string; email: string }) {
  return `test:${user.id}:${user.email}`;
}

export function bearer(user: { id: string; email: string }) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

export type TestUser = { id: string; email: string };

export async function createAuthUser(
  h: Harness,
  emailPrefix = 'shopper',
): Promise<TestUser> {
  const user = {
    id: randomUUID(),
    email: `${emailPrefix}-${randomUUID().slice(0, 8)}@example.test`,
  };
  await h.db.query('insert into auth.users (id, email) values ($1, $2)', [
    user.id,
    user.email,
  ]);
  return user;
}

export async function createAdmin(
  h: Harness,
  role: 'OWNER' | 'ADMIN' | 'STAFF',
): Promise<TestUser> {
  const user = await createAuthUser(h, role.toLowerCase());
  await h.db.query(
    `insert into public.admin_users (id, email, role, status) values ($1, $2, $3, 'ACTIVE')`,
    [user.id, user.email, role],
  );
  return user;
}

/** Creates an ACTIVE single-variant product with stock via the admin API. */
export async function createProduct(
  h: Harness,
  owner: TestUser,
  opts: { pricePence?: number; stock?: number } = {},
): Promise<{
  productId: string;
  variantId: string;
  sku: string;
  pricePence: number;
}> {
  const slug = `qa-${randomUUID().slice(0, 8)}`;
  const pricePence = opts.pricePence ?? 2500;
  const res = await h
    .http()
    .post(`${API}/admin/products`)
    .set(bearer(owner))
    .send({
      name: `QA Product ${slug}`,
      slug,
      productType: 'SIMPLE',
      basePricePence: pricePence,
      sku: 'STD',
      initialStock: opts.stock ?? 10,
    });
  if (res.status !== 201) {
    throw new Error(`createProduct failed: ${res.status} ${res.text}`);
  }
  const productId = res.body.data.id as string;
  const variants = await h
    .http()
    .get(`${API}/admin/products/${productId}/variants`)
    .set(bearer(owner));
  const variant = variants.body.data[0];
  return { productId, variantId: variant.id, sku: variant.sku, pricePence };
}

export async function stockOf(h: Harness, variantId: string) {
  const { rows } = await h.db.query(
    `select on_hand, reserved from public.inventory_items i
     join public.warehouses w on w.id = i.warehouse_id and w.is_default
     where i.variant_id = $1`,
    [variantId],
  );
  const row = rows[0] ?? { on_hand: 0, reserved: 0 };
  return {
    onHand: Number(row.on_hand),
    reserved: Number(row.reserved),
    available: Number(row.on_hand) - Number(row.reserved),
  };
}

export async function newGuestCart(h: Harness) {
  const res = await h.http().post(`${API}/carts`);
  return {
    cartId: res.body.data.cartId as string,
    guestToken: res.body.data.guestToken as string,
  };
}

export async function addToCart(
  h: Harness,
  cart: { cartId: string; guestToken: string },
  variantId: string,
  quantity: number,
) {
  return h
    .http()
    .post(`${API}/carts/${cart.cartId}/items`)
    .set('X-Guest-Token', cart.guestToken)
    .send({ variantId, quantity });
}

export async function shippingMethod(h: Harness, code = 'STANDARD') {
  const res = await h.http().get(`${API}/shipping/methods`);
  return (
    res.body.data as Array<{ id: string; code: string; pricePence: number }>
  ).find((m) => m.code === code)!;
}

export const ADDRESS = {
  fullName: 'Ada Lovelace',
  line1: '10 Downing Street',
  city: 'London',
  postcode: 'SW1A 2AA',
  country: 'GB',
  phone: '07700 900123',
};

export function checkoutBody(
  cartId: string,
  shippingMethodId: string,
  email: string,
  extra: Record<string, unknown> = {},
) {
  return {
    cartId,
    shippingMethodId,
    email,
    shippingAddress: ADDRESS,
    ...extra,
  };
}

export async function setSetting(
  h: Harness,
  owner: TestUser,
  key: string,
  value: Record<string, unknown>,
) {
  const res = await h
    .http()
    .put(`${API}/admin/settings/${key}`)
    .set(bearer(owner))
    .send({ value });
  if (res.status !== 200) {
    throw new Error(`setSetting failed: ${res.status} ${res.text}`);
  }
}

export const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000',
  'hex',
);
