import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API,
  addToCart,
  bearer,
  checkoutBody,
  createAdmin,
  createAuthUser,
  createHarness,
  createProduct,
  newGuestCart,
  setSetting,
  shippingMethod,
  stockOf,
  type Harness,
  type TestUser,
} from './harness.js';

describe('Admin, security & maintenance', () => {
  let h: Harness;
  let owner: TestUser;
  let admin: TestUser;
  let staff: TestUser;
  let customer: TestUser;

  beforeAll(async () => {
    h = await createHarness();
    owner = await createAdmin(h, 'OWNER');
    admin = await createAdmin(h, 'ADMIN');
    staff = await createAdmin(h, 'STAFF');
    customer = await createAuthUser(h);
  });
  afterAll(() => h.close());

  it('SEC-01 admin routes: no token 401, customer 403, bad token 401', async () => {
    expect((await h.http().get(`${API}/admin/orders`)).status).toBe(401);
    expect(
      (await h.http().get(`${API}/admin/orders`).set(bearer(customer))).status,
    ).toBe(403);
    expect(
      (
        await h
          .http()
          .get(`${API}/admin/orders`)
          .set('Authorization', 'Bearer garbage')
      ).status,
    ).toBe(401);
  });

  it('SEC-02 disabled admin loses access immediately', async () => {
    const temp = await createAdmin(h, 'ADMIN');
    expect(
      (await h.http().get(`${API}/admin/orders`).set(bearer(temp))).status,
    ).toBe(200);
    await h.db.query(
      `update public.admin_users set status = 'DISABLED' where id = $1`,
      [temp.id],
    );
    expect(
      (await h.http().get(`${API}/admin/orders`).set(bearer(temp))).status,
    ).toBe(403);
  });

  it('SEC-03 bank details are OWNER-only (ADMIN and STAFF refused)', async () => {
    const body = {
      bankName: 'Evil Bank',
      accountName: 'Mallory',
      sortCode: '11-22-33',
      accountNumber: '87654321',
      isActive: true,
    };
    expect(
      (
        await h
          .http()
          .post(`${API}/admin/bank-accounts`)
          .set(bearer(admin))
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await h
          .http()
          .post(`${API}/admin/bank-accounts`)
          .set(bearer(staff))
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (await h.http().get(`${API}/admin/bank-accounts`).set(bearer(admin)))
        .status,
    ).toBe(403);
  });

  it('SEC-04 ADMIN can still manage platform settings; STAFF cannot', async () => {
    expect(
      (await h.http().get(`${API}/admin/settings`).set(bearer(admin))).status,
    ).toBe(200);
    expect(
      (await h.http().get(`${API}/admin/settings`).set(bearer(staff))).status,
    ).toBe(403);
  });

  it('ADM-01 bank account validation + audit (account number masked)', async () => {
    const bad = await h
      .http()
      .post(`${API}/admin/bank-accounts`)
      .set(bearer(owner))
      .send({
        bankName: 'B',
        accountName: 'A',
        sortCode: '1234',
        accountNumber: '12',
        isActive: false,
      });
    expect(bad.status).toBe(400);
    const ok = await h
      .http()
      .post(`${API}/admin/bank-accounts`)
      .set(bearer(owner))
      .send({
        bankName: 'QA Bank',
        accountName: 'Fareya Ltd',
        sortCode: '112233',
        accountNumber: '11223344',
        iban: 'gb29 nwbk 6016 1331 9268 19',
        isActive: false,
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({
      sortCode: '11-22-33',
      iban: 'GB29NWBK60161331926819',
    });
    const { rows } = await h.db.query(
      `select after from public.audit_logs where entity_id = $1 and action = 'BANK_ACCOUNT_CREATED'`,
      [ok.body.data.id],
    );
    expect(rows[0].after).toMatchObject({ accountNumberLast4: '3344' });
    expect(JSON.stringify(rows[0].after)).not.toContain('11223344');
  });

  it('ADM-02 settings: unknown key 404, wrong types 400, valid update audited', async () => {
    expect(
      (
        await h
          .http()
          .put(`${API}/admin/settings/hacker`)
          .set(bearer(owner))
          .send({ value: { a: 1 } })
      ).status,
    ).toBe(404);
    for (const value of [
      { minOrderPence: -5 },
      { minOrderPence: 'ten' },
      { guestCheckoutEnabled: 'yes' },
      { minOrderPence: 1.5 },
    ]) {
      const res = await h
        .http()
        .put(`${API}/admin/settings/checkout`)
        .set(bearer(owner))
        .send({ value });
      expect(res.status, JSON.stringify(value)).toBe(400);
    }
    await setSetting(h, owner, 'checkout', { minOrderPence: 0 });
  });

  it('ADM-03 inventory adjust: bounds, unknown movement type, below-reserved refused', async () => {
    const p = await createProduct(h, owner, { stock: 3 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, 2);
    const { rows } = await h.db.query(
      'select id from public.warehouses where is_default',
    );
    const base = {
      warehouseId: rows[0].id,
      variantId: p.variantId,
      reason: 'count',
    };
    const below = await h
      .http()
      .post(`${API}/admin/inventory/adjust`)
      .set(bearer(staff))
      .send({ ...base, onHandDelta: -2 });
    expect(below.status).toBe(400);
    expect(below.body.error.code).toBe('STOCK_BELOW_RESERVED');
    expect(below.body.error.message).not.toMatch(/on_hand|reserved </);
    const type = await h
      .http()
      .post(`${API}/admin/inventory/adjust`)
      .set(bearer(staff))
      .send({ ...base, onHandDelta: 1, movementType: 'ORDER_RESERVATION' });
    expect(type.status).toBe(400);
    const ok = await h
      .http()
      .post(`${API}/admin/inventory/adjust`)
      .set(bearer(staff))
      .send({ ...base, onHandDelta: 4, movementType: 'PURCHASE' });
    expect(ok.status).toBe(201);
    expect(await stockOf(h, p.variantId)).toMatchObject({
      onHand: 7,
      reserved: 2,
    });
  });

  it('ADM-04 deleting a product with reserved stock is refused; INACTIVE is suggested', async () => {
    const p = await createProduct(h, owner, { stock: 3 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, 1);
    const res = await h
      .http()
      .delete(`${API}/admin/products/${p.productId}`)
      .set(bearer(owner));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STOCK_RESERVED');
    await h
      .http()
      .delete(
        `${API}/carts/${cart.cartId}/items/${(await h.http().get(`${API}/carts/${cart.cartId}`).set('X-Guest-Token', cart.guestToken)).body.data.items[0].id}`,
      )
      .set('X-Guest-Token', cart.guestToken);
    expect(
      (
        await h
          .http()
          .delete(`${API}/admin/products/${p.productId}`)
          .set(bearer(owner))
      ).status,
    ).toBe(200);
  });

  it('ADM-05 duplicate slug → 409, not 500; nothing half-created', async () => {
    const slug = `dup-${randomUUID().slice(0, 6)}`;
    const body = {
      name: 'Dup',
      slug,
      productType: 'SIMPLE',
      basePricePence: 100,
      sku: 'X',
    };
    expect(
      (
        await h
          .http()
          .post(`${API}/admin/products`)
          .set(bearer(owner))
          .send(body)
      ).status,
    ).toBe(201);
    const again = await h
      .http()
      .post(`${API}/admin/products`)
      .set(bearer(owner))
      .send(body);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DUPLICATE');
    const { rows } = await h.db.query(
      'select count(*)::int n from public.products where slug = $1',
      [slug],
    );
    expect(rows[0].n).toBe(1);
  });

  it('ADM-06 price edit updates the single price row the shop reads', async () => {
    const p = await createProduct(h, owner, { stock: 3, pricePence: 1000 });
    for (const price of [1200, 1300]) {
      await h
        .http()
        .patch(`${API}/admin/products/${p.productId}/variants/${p.variantId}`)
        .set(bearer(owner))
        .send({ basePricePence: price });
    }
    const { rows } = await h.db.query(
      'select base_price_pence from public.product_prices where variant_id = $1',
      [p.variantId],
    );
    expect(rows).toEqual([{ base_price_pence: '1300' }]);
  });

  it('ADM-07 malformed ids in admin routes → 400, never 500', async () => {
    for (const path of [
      'admin/orders/xyz',
      'admin/products/xyz',
      'admin/customers/xyz',
    ]) {
      const res = await h.http().get(`${API}/${path}`).set(bearer(owner));
      expect(res.status, path).toBe(400);
      expect(res.body.success).toBe(false);
    }
  });

  it('ADM-08 customer status must be ACTIVE|BLOCKED; unknown customer 404', async () => {
    const res = await h
      .http()
      .patch(`${API}/admin/customers/${customer.id}/status`)
      .set(bearer(owner))
      .send({ status: 'DELETED' });
    expect(res.status).toBe(400);
    const missing = await h
      .http()
      .patch(`${API}/admin/customers/${randomUUID()}/status`)
      .set(bearer(owner))
      .send({ status: 'BLOCKED' });
    expect(missing.status).toBe(404);
  });

  it('ADM-09 registration closed setting blocks sign-up', async () => {
    await setSetting(h, owner, 'security', { blockNewRegistrations: true });
    try {
      const res = await h
        .http()
        .post(`${API}/auth/sign-up`)
        .send({ email: 'new@example.test', password: 'longenough1' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('REGISTRATION_CLOSED');
    } finally {
      await setSetting(h, owner, 'security', { blockNewRegistrations: false });
    }
  });

  it('MNT-01 idle cart holds are released; active carts keep theirs; cart lines survive', async () => {
    const p = await createProduct(h, owner, { stock: 5 });
    const idle = await newGuestCart(h);
    const active = await newGuestCart(h);
    await addToCart(h, idle, p.variantId, 2);
    await addToCart(h, active, p.variantId, 1);
    await h.db.query(
      `update public.carts set updated_at = now() - interval '3 hours' where id = $1`,
      [idle.cartId],
    );

    const res = await h
      .http()
      .post(`${API}/admin/maintenance/release-expired-holds`)
      .set(bearer(owner));
    expect(res.status).toBe(201);
    expect(res.body.data.cartsReleased).toBeGreaterThanOrEqual(1);
    expect((await stockOf(h, p.variantId)).reserved).toBe(1);
    const view = await h
      .http()
      .get(`${API}/carts/${idle.cartId}`)
      .set('X-Guest-Token', idle.guestToken);
    expect(view.body.data.items[0].quantity).toBe(2);

    // Checkout re-reserves for the idle cart.
    const standardId = (await shippingMethod(h)).id;
    const placed = await h
      .http()
      .post(`${API}/checkout`)
      .set('X-Guest-Token', idle.guestToken)
      .send(checkoutBody(idle.cartId, standardId, 'idle@example.test'));
    expect(placed.status).toBe(201);
    expect((await stockOf(h, p.variantId)).reserved).toBe(3);
  });

  it('MNT-02 unpaid orders past the window are auto-cancelled; ones with proof are not', async () => {
    const p = await createProduct(h, owner, { stock: 5 });
    const standardId = (await shippingMethod(h)).id;
    const place = async (email: string) => {
      const cart = await newGuestCart(h);
      await addToCart(h, cart, p.variantId, 1);
      const r = await h
        .http()
        .post(`${API}/checkout`)
        .set('X-Guest-Token', cart.guestToken)
        .send(checkoutBody(cart.cartId, standardId, email));
      return r.body.data.orderNumber as string;
    };
    const stale = await place('stale@example.test');
    const fresh = await place('fresh@example.test');
    await h.db.query(
      `update public.orders set placed_at = now() - interval '4 days' where order_number = $1`,
      [stale],
    );

    const res = await h
      .http()
      .post(`${API}/admin/maintenance/release-expired-holds`)
      .set(bearer(owner));
    expect(res.body.data.ordersCancelled).toBeGreaterThanOrEqual(1);
    const { rows } = await h.db.query(
      `select order_number, status from public.orders where order_number = any($1) order by order_number`,
      [[stale, fresh]],
    );
    expect(
      Object.fromEntries(rows.map((r) => [r.order_number, r.status])),
    ).toEqual({
      [stale]: 'CANCELLED',
      [fresh]: 'PENDING_PAYMENT',
    });
    expect((await stockOf(h, p.variantId)).reserved).toBe(1);
  });

  it('MNT-03 cron endpoint requires the CRON_SECRET bearer; STAFF cannot run maintenance', async () => {
    expect(
      (await h.http().get(`${API}/cron/release-expired-holds`)).status,
    ).toBe(404);
    expect(
      (
        await h
          .http()
          .get(`${API}/cron/release-expired-holds`)
          .set('Authorization', 'Bearer wrong')
      ).status,
    ).toBe(404);
    expect(
      (
        await h
          .http()
          .get(`${API}/cron/release-expired-holds`)
          .set('Authorization', 'Bearer integration-cron-secret')
      ).status,
    ).toBe(200);
    expect(
      (
        await h
          .http()
          .post(`${API}/admin/maintenance/release-expired-holds`)
          .set(bearer(staff))
      ).status,
    ).toBe(403);
  });

  it('SEC-05 unexpected errors return a generic 500 envelope (no stack / SQL)', async () => {
    const res = await h
      .http()
      .get(`${API}/orders/lookup-does-not-exist-${'x'.repeat(10)}`);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(
      /at \w+ \(|select |relation /i,
    );
  });
});
