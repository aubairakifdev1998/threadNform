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

describe('Checkout', () => {
  let h: Harness;
  let owner: TestUser;
  let standard: { id: string; pricePence: number };

  beforeAll(async () => {
    h = await createHarness();
    owner = await createAdmin(h, 'OWNER');
    standard = await shippingMethod(h);
  });
  afterAll(() => h.close());

  async function readyCart(stock = 5, qty = 2, pricePence = 2500) {
    const p = await createProduct(h, owner, { stock, pricePence });
    const cart = await newGuestCart(h);
    expect((await addToCart(h, cart, p.variantId, qty)).status).toBe(201);
    return { p, cart };
  }

  function placeGuest(
    cart: { cartId: string; guestToken: string },
    email: string,
    opts: { key?: string; extra?: Record<string, unknown> } = {},
  ) {
    const req = h
      .http()
      .post(`${API}/checkout`)
      .set('X-Guest-Token', cart.guestToken);
    if (opts.key) req.set('Idempotency-Key', opts.key);
    return req.send(checkoutBody(cart.cartId, standard.id, email, opts.extra));
  }

  async function orderRow(orderNumber: string) {
    const { rows } = await h.db.query(
      'select * from public.orders where order_number = $1',
      [orderNumber],
    );
    return rows[0];
  }

  it('CHK-01 guest happy path: order, totals, VAT, reservation, cart converted, email', async () => {
    const { p, cart } = await readyCart(5, 2, 2500);
    const res = await placeGuest(cart, 'Guest@Example.TEST');
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data.orderNumber).toMatch(/^ORD-\d{4}-\d{6}$/);
    expect(data.totals).toMatchObject({
      subtotalPence: 5000,
      shippingPence: standard.pricePence,
      grandTotalPence: 5000 + standard.pricePence,
    });
    expect(data.totals.netPence + data.totals.vatPence).toBe(
      data.totals.grandTotalPence,
    );
    expect(data.bankAccount.accountNumber).toBeTruthy();
    expect(data.viewToken).toMatch(/^[a-f0-9]{64}$/);

    const order = await orderRow(data.orderNumber);
    expect(order.email).toBe('guest@example.test');
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(await stockOf(h, p.variantId)).toMatchObject({
      onHand: 5,
      reserved: 2,
    });
    const { rows: holds } = await h.db.query(
      `select reference_type, sum(quantity_delta)::int held from public.inventory_movements
       where variant_id = $1 and reference_type is not null
       group by reference_type order by reference_type`,
      [p.variantId],
    );
    expect(holds).toEqual([
      { reference_type: 'CART', held: 0 },
      { reference_type: 'ORDER', held: 2 },
    ]);
    const { rows: carts } = await h.db.query(
      'select status from public.carts where id = $1',
      [cart.cartId],
    );
    expect(carts[0].status).toBe('CONVERTED');
    await new Promise((r) => setTimeout(r, 50));
    expect(h.sentEmails).toContainEqual({
      event: 'ORDER_CREATED',
      to: 'guest@example.test',
    });
  });

  it('CHK-02 empty cart cannot be checked out', async () => {
    const cart = await newGuestCart(h);
    const res = await placeGuest(cart, 'empty@example.test');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CART_EMPTY');
    const { rows } = await h.db.query(
      'select status from public.carts where id = $1',
      [cart.cartId],
    );
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('CHK-03 double-click (same idempotency key, concurrent) creates exactly one order', async () => {
    const { p, cart } = await readyCart(5, 2);
    const key = randomUUID();
    const [a, b] = await Promise.all([
      placeGuest(cart, 'dbl@example.test', { key }),
      placeGuest(cart, 'dbl@example.test', { key }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.data.orderNumber).toBe(b.body.data.orderNumber);
    expect(
      [a.body.data.idempotentReplay, b.body.data.idempotentReplay].sort(),
    ).toEqual([false, true]);
    const { rows } = await h.db.query(
      'select count(*)::int n from public.orders where idempotency_key = $1',
      [key],
    );
    expect(rows[0].n).toBe(1);
    expect((await stockOf(h, p.variantId)).reserved).toBe(2);
  });

  it('CHK-04 retry after a lost response (same key, sequential) replays the order', async () => {
    const { cart } = await readyCart();
    const key = randomUUID();
    const first = await placeGuest(cart, 'retry@example.test', { key });
    const second = await placeGuest(cart, 'retry@example.test', { key });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({
      orderNumber: first.body.data.orderNumber,
      idempotentReplay: true,
    });
  });

  it('CHK-05 concurrent checkouts of one cart without keys create one order', async () => {
    const { p, cart } = await readyCart(5, 2);
    const results = await Promise.all([
      placeGuest(cart, 'race@example.test'),
      placeGuest(cart, 'race@example.test'),
      placeGuest(cart, 'race@example.test'),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status === 409)
        .every((r) => r.body.error.code === 'CART_ALREADY_CHECKED_OUT'),
    ).toBe(true);
    expect((await stockOf(h, p.variantId)).reserved).toBe(2);
  });

  it('CHK-06 checking out an already converted cart (back button) is refused', async () => {
    const { cart } = await readyCart();
    expect((await placeGuest(cart, 'back@example.test')).status).toBe(201);
    const again = await placeGuest(cart, 'back@example.test');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CART_ALREADY_CHECKED_OUT');
  });

  it('CHK-07 idempotency key reused by a different shopper does not leak their order', async () => {
    const { cart } = await readyCart();
    const key = randomUUID();
    expect(
      (await placeGuest(cart, 'victim@example.test', { key })).status,
    ).toBe(201);
    const { cart: attackerCart } = await readyCart();
    const res = await placeGuest(attackerCart, 'attacker@example.test', {
      key,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(JSON.stringify(res.body)).not.toContain('ORD-');
  });

  it('CHK-08 price changed between cart and checkout → PRICE_CHANGED, nothing created', async () => {
    const { p, cart } = await readyCart(5, 1, 2000);
    const shownTotal = 2000 + standard.pricePence;
    await h
      .http()
      .patch(`${API}/admin/products/${p.productId}/variants/${p.variantId}`)
      .set(bearer(owner))
      .send({ basePricePence: 2600 });
    const res = await placeGuest(cart, 'price@example.test', {
      extra: { expectedTotalPence: shownTotal },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    expect(res.body.error.details.grandTotalPence).toBe(
      2600 + standard.pricePence,
    );
    const { rows } = await h.db.query(
      'select status from public.carts where id = $1',
      [cart.cartId],
    );
    expect(rows[0].status).toBe('ACTIVE');
    expect((await stockOf(h, p.variantId)).reserved).toBe(1);

    const ok = await placeGuest(cart, 'price@example.test', {
      extra: { expectedTotalPence: 2600 + standard.pricePence },
    });
    expect(ok.status).toBe(201);
  });

  it('CHK-09 product deactivated during checkout → VARIANT/PRODUCT unavailable, rolled back', async () => {
    const { p, cart } = await readyCart();
    await h
      .http()
      .patch(`${API}/admin/products/${p.productId}`)
      .set(bearer(owner))
      .send({ status: 'INACTIVE' });
    const res = await placeGuest(cart, 'gone@example.test');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_NOT_PURCHASABLE');
    const { rows } = await h.db.query(
      'select count(*)::int n from public.orders where email = $1',
      ['gone@example.test'],
    );
    expect(rows[0].n).toBe(0);
  });

  it('CHK-10 stock sold elsewhere during checkout → INSUFFICIENT_STOCK with SKU, full rollback', async () => {
    await setSetting(h, owner, 'inventory', { reserveOnCart: false });
    try {
      const p = await createProduct(h, owner, { stock: 2 });
      const a = await newGuestCart(h);
      const b = await newGuestCart(h);
      await addToCart(h, a, p.variantId, 2);
      await addToCart(h, b, p.variantId, 2);
      expect((await placeGuest(a, 'first@example.test')).status).toBe(201);
      const res = await placeGuest(b, 'second@example.test');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.error.details).toMatchObject({
        sku: p.sku,
        available: 0,
        requested: 2,
      });
      const { rows } = await h.db.query(
        'select count(*)::int n from public.orders where email = $1',
        ['second@example.test'],
      );
      expect(rows[0].n).toBe(0);
      const { rows: carts } = await h.db.query(
        'select status from public.carts where id = $1',
        [b.cartId],
      );
      expect(carts[0].status).toBe('ACTIVE');
      expect(await stockOf(h, p.variantId)).toMatchObject({
        onHand: 2,
        reserved: 2,
      });
    } finally {
      await setSetting(h, owner, 'inventory', { reserveOnCart: true });
    }
  });

  it('CHK-11 many concurrent checkouts for the last units never oversell', async () => {
    await setSetting(h, owner, 'inventory', { reserveOnCart: false });
    try {
      const p = await createProduct(h, owner, { stock: 3 });
      const carts = await Promise.all(
        Array.from({ length: 6 }, () => newGuestCart(h)),
      );
      for (const c of carts) await addToCart(h, c, p.variantId, 1);
      const results = await Promise.all(
        carts.map((c, i) => placeGuest(c, `rush${i}@example.test`)),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
      expect(await stockOf(h, p.variantId)).toMatchObject({
        onHand: 3,
        reserved: 3,
      });
    } finally {
      await setSetting(h, owner, 'inventory', { reserveOnCart: true });
    }
  });

  it("CHK-12 reservation failure does not steal other orders' reservations (regression)", async () => {
    await setSetting(h, owner, 'inventory', { reserveOnCart: false });
    try {
      const p = await createProduct(h, owner, { stock: 3 });
      const a = await newGuestCart(h);
      await addToCart(h, a, p.variantId, 3);
      expect((await placeGuest(a, 'holder@example.test')).status).toBe(201);
      expect((await stockOf(h, p.variantId)).reserved).toBe(3);
      // A second shopper's checkout used to "release cart holds" it never had.
      const b = await newGuestCart(h);
      await h.db.query(
        `insert into public.cart_items (cart_id, variant_id, quantity) values ($1, $2, 1)`,
        [b.cartId, p.variantId],
      );
      const res = await placeGuest(b, 'thief@example.test');
      expect(res.status).toBe(409);
      expect(await stockOf(h, p.variantId)).toMatchObject({
        onHand: 3,
        reserved: 3,
      });
    } finally {
      await setSetting(h, owner, 'inventory', { reserveOnCart: true });
    }
  });

  it('CHK-13 invalid UK postcode / non-UK country / bad phone rejected', async () => {
    const { cart } = await readyCart();
    const bad = [
      {
        shippingAddress: {
          fullName: 'A',
          line1: '1 St',
          city: 'X',
          postcode: '12345',
        },
      },
      {
        shippingAddress: {
          fullName: 'A',
          line1: '1 St',
          city: 'X',
          postcode: 'SW1A 2AA',
          country: 'FR',
        },
      },
      { phone: '12' },
    ];
    for (const extra of bad) {
      const res = await placeGuest(cart, 'addr@example.test', { extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    const { rows } = await h.db.query(
      'select status from public.carts where id = $1',
      [cart.cartId],
    );
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('CHK-14 malformed payloads → 400 (missing fields, bad email, unknown fields, oversize note)', async () => {
    const { cart } = await readyCart();
    const cases: Array<Record<string, unknown>> = [
      { cartId: cart.cartId },
      { ...checkoutBody(cart.cartId, standard.id, 'not-an-email') },
      {
        ...checkoutBody(cart.cartId, standard.id, 'x@example.test'),
        isAdmin: true,
      },
      {
        ...checkoutBody(cart.cartId, standard.id, 'x@example.test'),
        customerNote: 'x'.repeat(501),
      },
      { ...checkoutBody(cart.cartId, 'nope', 'x@example.test') },
    ];
    for (const body of cases) {
      const res = await h
        .http()
        .post(`${API}/checkout`)
        .set('X-Guest-Token', cart.guestToken)
        .send(body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(res.body.success).toBe(false);
    }
  });

  it('CHK-15 unknown / inactive shipping method rejected', async () => {
    const { cart } = await readyCart();
    const res = await h
      .http()
      .post(`${API}/checkout`)
      .set('X-Guest-Token', cart.guestToken)
      .send(checkoutBody(cart.cartId, randomUUID(), 'ship@example.test'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SHIPPING_METHOD_UNAVAILABLE');
  });

  it('CHK-16 guest token missing / wrong → no order', async () => {
    const { cart } = await readyCart();
    const missing = await h
      .http()
      .post(`${API}/checkout`)
      .send(checkoutBody(cart.cartId, standard.id, 'a@example.test'));
    expect(missing.status).toBe(400);
    const wrong = await h
      .http()
      .post(`${API}/checkout`)
      .set('X-Guest-Token', randomUUID())
      .send(checkoutBody(cart.cartId, standard.id, 'a@example.test'));
    expect(wrong.status).toBe(404);
  });

  it('CHK-17 signed-in checkout of a guest cart links the order to the customer', async () => {
    const user = await createAuthUser(h);
    const { cart } = await readyCart();
    const res = await h
      .http()
      .post(`${API}/checkout/authenticated`)
      .set(bearer(user))
      .set('X-Guest-Token', cart.guestToken)
      .send(checkoutBody(cart.cartId, standard.id, user.email));
    expect(res.status).toBe(201);
    expect((await orderRow(res.body.data.orderNumber)).customer_id).toBe(
      user.id,
    );
    const mine = await h.http().get(`${API}/orders`).set(bearer(user));
    expect(
      mine.body.data.items.map((o: { orderNumber: string }) => o.orderNumber),
    ).toContain(res.body.data.orderNumber);
  });

  it('CHK-18 expired / invalid session on authenticated checkout → 401', async () => {
    const { cart } = await readyCart();
    const res = await h
      .http()
      .post(`${API}/checkout/authenticated`)
      .set('Authorization', 'Bearer expired-token')
      .set('X-Guest-Token', cart.guestToken)
      .send(checkoutBody(cart.cartId, standard.id, 'exp@example.test'));
    expect(res.status).toBe(401);
  });

  it('CHK-19 blocked customer cannot place orders', async () => {
    const user = await createAuthUser(h);
    await h.http().get(`${API}/customers/me`).set(bearer(user));
    await h
      .http()
      .patch(`${API}/admin/customers/${user.id}/status`)
      .set(bearer(owner))
      .send({ status: 'BLOCKED' });
    const { cart } = await readyCart();
    const res = await h
      .http()
      .post(`${API}/checkout/authenticated`)
      .set(bearer(user))
      .set('X-Guest-Token', cart.guestToken)
      .send(checkoutBody(cart.cartId, standard.id, user.email));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
  });

  it('CHK-20 admin settings are enforced: guest checkout off, min order, phone, notes, maintenance', async () => {
    try {
      await setSetting(h, owner, 'checkout', { guestCheckoutEnabled: false });
      let { cart } = await readyCart();
      let res = await placeGuest(cart, 'set@example.test');
      expect(res.body.error?.code).toBe('GUEST_CHECKOUT_DISABLED');
      await setSetting(h, owner, 'checkout', {
        guestCheckoutEnabled: true,
        minOrderPence: 10_000,
      });

      ({ cart } = await readyCart(5, 1, 2500));
      res = await placeGuest(cart, 'set@example.test');
      expect(res.body.error?.code).toBe('MIN_ORDER_NOT_MET');
      await setSetting(h, owner, 'checkout', {
        minOrderPence: 0,
        requirePhone: true,
      });

      res = await placeGuest(cart, 'set@example.test', {
        extra: {
          shippingAddress: {
            fullName: 'A B',
            line1: '1 St',
            city: 'Leeds',
            postcode: 'LS1 1AA',
          },
        },
      });
      expect(res.body.error?.code).toBe('PHONE_REQUIRED');
      await setSetting(h, owner, 'checkout', {
        requirePhone: false,
        allowNotes: false,
      });

      res = await placeGuest(cart, 'set@example.test', {
        extra: { customerNote: 'leave by door' },
      });
      expect(res.status).toBe(201);
      expect(
        (await orderRow(res.body.data.orderNumber)).customer_note,
      ).toBeNull();

      await setSetting(h, owner, 'storefront', { maintenanceMode: true });
      ({ cart } = await readyCart());
      res = await placeGuest(cart, 'set@example.test');
      expect(res.body.error?.code).toBe('STORE_MAINTENANCE');
    } finally {
      await setSetting(h, owner, 'checkout', {
        guestCheckoutEnabled: true,
        minOrderPence: 0,
        requirePhone: false,
        allowNotes: true,
      });
      await setSetting(h, owner, 'storefront', { maintenanceMode: false });
    }
  });

  it('CHK-21 VAT/rounding: totals are integers and net + VAT = gross for odd amounts', async () => {
    const { cart } = await readyCart(10, 3, 333);
    const res = await placeGuest(cart, 'vat@example.test');
    const t = res.body.data.totals;
    expect(t.subtotalPence).toBe(999);
    for (const v of Object.values(t).filter((x) => typeof x === 'number')) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(t.netPence + t.vatPence).toBe(t.grandTotalPence);
  });

  it('CHK-22 order lookup and view token: owner can view, others cannot enumerate', async () => {
    const { cart } = await readyCart();
    const placed = (await placeGuest(cart, 'view@example.test')).body.data;
    const ok = await h
      .http()
      .get(`${API}/orders/${placed.orderNumber}`)
      .query({ email: 'view@example.test', viewToken: placed.viewToken });
    expect(ok.status).toBe(200);
    expect(ok.body.data.items).toHaveLength(1);

    const noToken = await h
      .http()
      .get(`${API}/orders/${placed.orderNumber}`)
      .query({ email: 'view@example.test' });
    const wrongEmail = await h
      .http()
      .post(`${API}/orders/lookup`)
      .send({ orderNumber: placed.orderNumber, email: 'x@example.test' });
    const missing = await h
      .http()
      .post(`${API}/orders/lookup`)
      .send({ orderNumber: 'ORD-1999-000001', email: 'x@example.test' });
    expect(noToken.status).toBe(400);
    expect(wrongEmail.body.error).toEqual(missing.body.error);
    const stranger = await createAuthUser(h);
    const asStranger = await h
      .http()
      .get(`${API}/orders/${placed.orderNumber}`)
      .set(bearer(stranger));
    expect(asStranger.status).toBe(400);
  });
});
