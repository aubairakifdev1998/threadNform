import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API,
  PNG_BYTES,
  addToCart,
  bearer,
  checkoutBody,
  createAdmin,
  createAuthUser,
  createHarness,
  createProduct,
  newGuestCart,
  shippingMethod,
  type Harness,
  type TestUser,
} from './harness.js';

describe('Rate limiting & customer notifications', () => {
  let h: Harness;
  let owner: TestUser;

  beforeAll(async () => {
    h = await createHarness({ rateLimit: true });
    owner = await createAdmin(h, 'OWNER');
  });
  afterAll(() => h.close());

  const lookup = (ip: string, orderNumber = 'ORD-2000-000001') =>
    h
      .http()
      .post(`${API}/orders/lookup`)
      .set('X-Forwarded-For', ip)
      .send({ orderNumber, email: 'probe@example.test' });

  it('RL-01 order lookup brute force: 11th attempt from one IP → 429 + Retry-After', async () => {
    const ip = '203.0.113.10';
    for (let i = 0; i < 5; i += 1) {
      expect((await lookup(ip, `ORD-2000-00000${i}`)).status).toBe(400);
    }
    for (let i = 5; i < 10; i += 1) {
      expect((await lookup(ip, `ORD-2000-00001${i}`)).status).toBe(400);
    }
    const blocked = await lookup(ip, 'ORD-2000-000099');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('RL-02 limits are per client: another IP is unaffected', async () => {
    expect((await lookup('203.0.113.11')).status).toBe(400);
  });

  it('RL-03 per-target limit: one order number guessed from many IPs → 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push(
        (await lookup(`198.51.100.${i}`, 'ORD-2000-777777')).status,
      );
    }
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
  });

  it('RL-04 sign-in credential stuffing on one email across IPs → 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await h
        .http()
        .post(`${API}/auth/sign-in`)
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .send({ email: 'victim@example.test', password: 'wrong-password' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('RL-05 limiter store failure: auth/lookup fail closed; cart still served', async () => {
    await h.db.query(
      'alter function public.hit_rate_limit(text, int, int) rename to hit_rate_limit_off',
    );
    try {
      expect((await lookup('203.0.113.50')).status).toBe(429);
      const cart = await h.http().post(`${API}/carts`);
      expect(cart.status).toBe(201);
    } finally {
      await h.db.query(
        'alter function public.hit_rate_limit_off(text, int, int) rename to hit_rate_limit',
      );
    }
  });

  it('RL-06 cron purges old rate-limit windows', async () => {
    await h.db.query(
      `insert into public.rate_limit_buckets (key, window_start, hits) values ('old:test', now() - interval '3 days', 5)`,
    );
    const res = await h
      .http()
      .get(`${API}/cron/release-expired-holds`)
      .set('Authorization', 'Bearer integration-cron-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.rateLimitBucketsPurged).toBeGreaterThanOrEqual(1);
  });

  async function paidOrder(customer: TestUser) {
    const p = await createProduct(h, owner, { stock: 5 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, 1);
    const placed = await h
      .http()
      .post(`${API}/checkout/authenticated`)
      .set(bearer(customer))
      .set('X-Guest-Token', cart.guestToken)
      .send(
        checkoutBody(cart.cartId, (await shippingMethod(h)).id, customer.email),
      );
    const orderNumber = placed.body.data.orderNumber as string;
    const { rows } = await h.db.query(
      `select o.id, p.id payment_id from public.orders o join public.payments p on p.order_id = o.id where order_number = $1`,
      [orderNumber],
    );
    const up = await h
      .http()
      .post(`${API}/storage/upload`)
      .set(bearer(customer))
      .field('bucket', 'payment-proofs')
      .field('folder', `orders/${orderNumber}`)
      .attach('file', PNG_BYTES, {
        filename: 'p.png',
        contentType: 'image/png',
      });
    await h
      .http()
      .post(`${API}/orders/${orderNumber}/payment-proofs`)
      .set(bearer(customer))
      .send({
        storagePath: up.body.data.path,
        mime: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
    return {
      orderNumber,
      orderId: rows[0].id as string,
      paymentId: rows[0].payment_id as string,
    };
  }

  const settle = () => new Promise((r) => setTimeout(r, 100));
  const emailsTo = (to: string) =>
    h.sentEmails.filter((e) => e.to === to).map((e) => e.event);

  it('NTF-01 customer is emailed on reject, approve, ship and delivery', async () => {
    const customer = await createAuthUser(h);
    const o = await paidOrder(customer);
    await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/reject`)
      .set(bearer(owner))
      .send({ reason: 'Wrong amount' });
    h.storage.set(
      `payment-proofs/orders/${o.orderNumber}/second.png`,
      PNG_BYTES,
    );
    await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/payment-proofs`)
      .set(bearer(customer))
      .send({
        storagePath: `orders/${o.orderNumber}/second.png`,
        mime: 'image/png',
        sizeBytes: 10,
      });
    await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/approve`)
      .set(bearer(owner));
    for (const status of ['PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED']) {
      await h
        .http()
        .patch(`${API}/admin/orders/${o.orderId}/status`)
        .set(bearer(owner))
        .send({ status, carrier: 'DPD' });
    }
    await settle();
    expect(emailsTo(customer.email)).toEqual([
      'ORDER_CREATED',
      'PAYMENT_REJECTED',
      'PAYMENT_APPROVED',
      'ORDER_SHIPPED',
      'ORDER_DELIVERED',
    ]);
  });

  it('NTF-02 cancellation emails the customer once; rolled-back duplicates send nothing', async () => {
    const customer = await createAuthUser(h);
    const o = await paidOrder(customer);
    await Promise.all([
      h
        .http()
        .post(`${API}/admin/orders/${o.orderId}/cancel`)
        .set(bearer(owner))
        .send({ reason: 'Out of stock' }),
      h
        .http()
        .post(`${API}/admin/orders/${o.orderId}/cancel`)
        .set(bearer(owner))
        .send({ reason: 'Out of stock' }),
    ]);
    await settle();
    expect(
      emailsTo(customer.email).filter((e) => e === 'ORDER_CANCELLED'),
    ).toHaveLength(1);
  });
});
