import { randomUUID } from 'node:crypto';
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
  stockOf,
  type Harness,
  type TestUser,
} from './harness.js';

describe('Partial shipments, partial refunds & email outbox', () => {
  let h: Harness;
  let owner: TestUser;
  let staff: TestUser;
  let standardId: string;
  let shippingPence: number;

  beforeAll(async () => {
    h = await createHarness();
    owner = await createAdmin(h, 'OWNER');
    staff = await createAdmin(h, 'STAFF');
    const method = await shippingMethod(h);
    standardId = method.id;
    shippingPence = method.pricePence;
  });
  afterAll(() => h.close());

  /** Order: 3 × A (£10) + 2 × B (£20); optionally paid & verified. */
  async function order(opts: { paid?: boolean } = { paid: true }) {
    const customer = await createAuthUser(h);
    const a = await createProduct(h, owner, { stock: 10, pricePence: 1000 });
    const b = await createProduct(h, owner, { stock: 10, pricePence: 2000 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, a.variantId, 3);
    await addToCart(h, cart, b.variantId, 2);
    const placed = await h
      .http()
      .post(`${API}/checkout/authenticated`)
      .set(bearer(customer))
      .set('X-Guest-Token', cart.guestToken)
      .send(checkoutBody(cart.cartId, standardId, customer.email));
    expect(placed.status).toBe(201);
    const orderNumber = placed.body.data.orderNumber as string;
    const { rows } = await h.db.query(
      `select o.id, p.id payment_id from public.orders o join public.payments p on p.order_id = o.id where order_number = $1`,
      [orderNumber],
    );
    const { rows: items } = await h.db.query(
      `select id, variant_id from public.order_items where order_id = $1`,
      [rows[0].id],
    );
    const itemFor = (variantId: string) =>
      items.find((i) => i.variant_id === variantId).id as string;
    const o = {
      customer,
      a,
      b,
      orderNumber,
      orderId: rows[0].id as string,
      paymentId: rows[0].payment_id as string,
      itemA: itemFor(a.variantId),
      itemB: itemFor(b.variantId),
      total: 3 * 1000 + 2 * 2000 + shippingPence,
    };
    if (opts.paid) {
      const path = `orders/${orderNumber}/proof.png`;
      h.storage.set(`payment-proofs/${path}`, PNG_BYTES);
      await h
        .http()
        .post(`${API}/orders/${orderNumber}/payment-proofs`)
        .set(bearer(customer))
        .send({
          storagePath: path,
          mime: 'image/png',
          sizeBytes: PNG_BYTES.length,
        });
      const approved = await h
        .http()
        .post(`${API}/admin/payments/${o.paymentId}/approve`)
        .set(bearer(owner));
      expect(approved.status).toBe(201);
    }
    return o;
  }

  const ship = (
    orderId: string,
    body: Record<string, unknown>,
    who: TestUser = owner,
    key?: string,
  ) => {
    const req = h
      .http()
      .post(`${API}/admin/orders/${orderId}/shipments`)
      .set(bearer(who));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const refund = (
    orderId: string,
    body: Record<string, unknown>,
    who: TestUser = owner,
    key?: string,
  ) => {
    const req = h
      .http()
      .post(`${API}/admin/orders/${orderId}/refunds`)
      .set(bearer(who));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const state = async (orderId: string) => {
    const { rows } = await h.db.query(
      `select o.status, o.payment_status, o.shipping_status, o.refunded_pence::int refunded, p.status payment
       from public.orders o join public.payments p on p.order_id = o.id where o.id = $1`,
      [orderId],
    );
    return rows[0];
  };
  const counters = async (itemId: string) => {
    const { rows } = await h.db.query(
      `select quantity_shipped s, quantity_cancelled c, quantity_returned r from public.order_items where id = $1`,
      [itemId],
    );
    return rows[0];
  };
  const settle = () => new Promise((r) => setTimeout(r, 100));

  it('FUL-01 partial shipment then remainder: statuses, stock, shipments, emails', async () => {
    const o = await order();
    const first = await ship(o.orderId, {
      items: [{ orderItemId: o.itemA, quantity: 2 }],
      carrier: 'Royal Mail',
      trackingNumber: 'RM1',
    });
    expect(first.status).toBe(201);
    expect(await state(o.orderId)).toMatchObject({
      status: 'PARTIALLY_SHIPPED',
      shipping_status: 'PARTIALLY_SHIPPED',
    });
    expect(await stockOf(h, o.a.variantId)).toMatchObject({
      onHand: 8,
      reserved: 1,
    });
    expect(await stockOf(h, o.b.variantId)).toMatchObject({
      onHand: 10,
      reserved: 2,
    });

    const rest = await ship(o.orderId, {
      carrier: 'DPD',
      trackingNumber: 'DPD9',
    });
    expect(rest.status).toBe(201);
    expect(await state(o.orderId)).toMatchObject({
      status: 'SHIPPED',
      shipping_status: 'SHIPPED',
    });
    expect(await stockOf(h, o.a.variantId)).toMatchObject({
      onHand: 7,
      reserved: 0,
    });
    expect(await stockOf(h, o.b.variantId)).toMatchObject({
      onHand: 8,
      reserved: 0,
    });

    const view = await h
      .http()
      .get(`${API}/orders/${o.orderNumber}`)
      .set(bearer(o.customer));
    expect(view.body.data.shipments).toHaveLength(2);
    expect(view.body.data.trackingNumber).toBe('DPD9');
    expect(
      view.body.data.items.find((i: { id: string }) => i.id === o.itemA),
    ).toMatchObject({
      quantityShipped: 3,
    });
    await settle();
    expect(
      h.sentEmails.filter(
        (e) => e.to === o.customer.email && e.event === 'ORDER_SHIPPED',
      ),
    ).toHaveLength(2);
    const nothing = await ship(o.orderId, {});
    expect(nothing.status).toBe(409);
  });

  it('FUL-02 invalid shipments: over-quantity, foreign item, unpaid, cancelled', async () => {
    const o = await order();
    const over = await ship(o.orderId, {
      items: [{ orderItemId: o.itemA, quantity: 4 }],
    });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('SHIP_QUANTITY_INVALID');
    const foreign = await ship(o.orderId, {
      items: [{ orderItemId: randomUUID(), quantity: 1 }],
    });
    expect(foreign.status).toBe(400);
    const zero = await ship(o.orderId, {
      items: [{ orderItemId: o.itemA, quantity: 0 }],
    });
    expect(zero.status).toBe(400);
    expect(await stockOf(h, o.a.variantId)).toMatchObject({
      onHand: 10,
      reserved: 3,
    });

    const unpaid = await order({ paid: false });
    const res = await ship(unpaid.orderId, {});
    expect(res.status).toBe(409);
    await h
      .http()
      .post(`${API}/admin/orders/${unpaid.orderId}/cancel`)
      .set(bearer(owner))
      .send({ reason: 'test' });
    expect((await ship(unpaid.orderId, {})).status).toBe(409);
  });

  it('FUL-03 concurrent shipments of the same units: stock deducted once', async () => {
    const o = await order();
    const body = { items: [{ orderItemId: o.itemA, quantity: 2 }] };
    const results = await Promise.all([
      ship(o.orderId, body),
      ship(o.orderId, body),
    ]);
    // Both fit individually (3 outstanding) only if sequential: 2 + 2 > 3.
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await stockOf(h, o.a.variantId)).toMatchObject({
      onHand: 8,
      reserved: 1,
    });
    expect(await counters(o.itemA)).toEqual({ s: 2, c: 0, r: 0 });
  });

  it('FUL-04 same Idempotency-Key twice (double click) → one shipment', async () => {
    const o = await order();
    const key = randomUUID();
    const body = { items: [{ orderItemId: o.itemA, quantity: 1 }] };
    const [a, b] = await Promise.all([
      ship(o.orderId, body, owner, key),
      ship(o.orderId, body, owner, key),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.data.shipment.id).toBe(b.body.data.shipment.id);
    expect(await counters(o.itemA)).toEqual({ s: 1, c: 0, r: 0 });
  });

  it('FUL-05 partial refund cancelling an unshipped unit releases its stock; rest ships', async () => {
    const o = await order();
    const res = await refund(o.orderId, {
      amountPence: 1000,
      reason: 'Customer removed one item',
      items: [{ orderItemId: o.itemA, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    expect(await state(o.orderId)).toMatchObject({
      status: 'CONFIRMED',
      payment: 'PARTIALLY_REFUNDED',
      payment_status: 'PARTIALLY_REFUNDED',
      refunded: 1000,
    });
    expect(await counters(o.itemA)).toEqual({ s: 0, c: 1, r: 0 });
    expect(await stockOf(h, o.a.variantId)).toMatchObject({
      onHand: 10,
      reserved: 2,
    });
    expect((await ship(o.orderId, {})).status).toBe(201);
    expect(await state(o.orderId)).toMatchObject({ status: 'SHIPPED' });
    expect(await stockOf(h, o.a.variantId)).toMatchObject({
      onHand: 8,
      reserved: 0,
    });
  });

  it('FUL-06 after a partial shipment, refunding the unshipped rest completes the order', async () => {
    const o = await order();
    await ship(o.orderId, { items: [{ orderItemId: o.itemA, quantity: 3 }] });
    const res = await refund(o.orderId, {
      amountPence: 4000,
      reason: 'Item B out of stock at supplier',
      items: [{ orderItemId: o.itemB, quantity: 2 }],
    });
    expect(res.status).toBe(201);
    expect(await state(o.orderId)).toMatchObject({
      status: 'SHIPPED',
      refunded: 4000,
    });
    expect(await stockOf(h, o.b.variantId)).toMatchObject({
      onHand: 10,
      reserved: 0,
    });
  });

  it('FUL-07 refunding shipped units: restock by default, not when damaged', async () => {
    const o = await order();
    await ship(o.orderId, {});
    await refund(o.orderId, {
      amountPence: 1000,
      reason: 'Returned unworn',
      items: [{ orderItemId: o.itemA, quantity: 1 }],
    });
    expect(await stockOf(h, o.a.variantId)).toMatchObject({ onHand: 8 });
    await refund(o.orderId, {
      amountPence: 2000,
      reason: 'Arrived damaged',
      items: [{ orderItemId: o.itemB, quantity: 1, restock: false }],
    });
    expect(await stockOf(h, o.b.variantId)).toMatchObject({ onHand: 8 });
    expect(await counters(o.itemA)).toEqual({ s: 3, c: 0, r: 1 });
    expect(await counters(o.itemB)).toEqual({ s: 2, c: 0, r: 1 });
    const tooMany = await refund(o.orderId, {
      amountPence: 100,
      reason: 'again',
      items: [{ orderItemId: o.itemB, quantity: 2 }],
    });
    expect(tooMany.status).toBe(400);
  });

  it('FUL-08 refund limits: over total, unpaid order, concurrent over-refund, double click', async () => {
    const unpaid = await order({ paid: false });
    expect(
      (await refund(unpaid.orderId, { amountPence: 100, reason: 'nope' }))
        .status,
    ).toBe(409);

    const o = await order();
    const over = await refund(o.orderId, {
      amountPence: o.total + 1,
      reason: 'too much',
    });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('REFUND_EXCEEDS_PAID');

    const half = Math.floor(o.total / 2) + 1;
    const race = await Promise.all([
      refund(o.orderId, { amountPence: half, reason: 'race one' }),
      refund(o.orderId, { amountPence: half, reason: 'race two' }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await state(o.orderId)).refunded).toBe(half);

    const key = randomUUID();
    const [x, y] = await Promise.all([
      refund(o.orderId, { amountPence: 100, reason: 'goodwill' }, owner, key),
      refund(o.orderId, { amountPence: 100, reason: 'goodwill' }, owner, key),
    ]);
    expect(x.body.data.refund.id).toBe(y.body.data.refund.id);
    expect((await state(o.orderId)).refunded).toBe(half + 100);
  });

  it('FUL-09 full flow: deliver → return → REFUNDED status refunds the remainder', async () => {
    const o = await order();
    await refund(o.orderId, {
      amountPence: 500,
      reason: 'Late delivery goodwill',
    });
    await ship(o.orderId, {});
    for (const status of ['DELIVERED', 'RETURN_REQUESTED', 'RETURNED']) {
      expect(
        (
          await h
            .http()
            .patch(`${API}/admin/orders/${o.orderId}/status`)
            .set(bearer(owner))
            .send({ status })
        ).status,
      ).toBe(200);
    }
    expect(await stockOf(h, o.a.variantId)).toMatchObject({ onHand: 10 });
    const res = await h
      .http()
      .patch(`${API}/admin/orders/${o.orderId}/status`)
      .set(bearer(owner))
      .send({ status: 'REFUNDED' });
    expect(res.status).toBe(200);
    expect(await state(o.orderId)).toMatchObject({
      status: 'REFUNDED',
      payment: 'REFUNDED',
      refunded: o.total,
    });
    const { rows } = await h.db.query(
      'select amount_pence::int a from public.refunds where order_id = $1 order by created_at',
      [o.orderId],
    );
    expect(rows.map((r) => r.a)).toEqual([500, o.total - 500]);
    await settle();
    expect(
      h.sentEmails.filter(
        (e) => e.to === o.customer.email && e.event === 'REFUND_ISSUED',
      ),
    ).toHaveLength(2);
  });

  it('FUL-10 refunding every unit before shipping cancels the order', async () => {
    const o = await order();
    const res = await refund(o.orderId, {
      reason: 'Customer changed their mind',
      items: [
        { orderItemId: o.itemA, quantity: 3 },
        { orderItemId: o.itemB, quantity: 2 },
      ],
    });
    expect(res.status).toBe(201);
    expect(await state(o.orderId)).toMatchObject({
      status: 'CANCELLED',
      payment: 'REFUNDED',
      refunded: o.total,
    });
    expect(await stockOf(h, o.a.variantId)).toMatchObject({
      onHand: 10,
      reserved: 0,
    });
  });

  it('FUL-11 cancelled paid order (REFUND_PENDING) is settled by recording the refund', async () => {
    const o = await order();
    await h
      .http()
      .post(`${API}/admin/orders/${o.orderId}/cancel`)
      .set(bearer(owner))
      .send({ reason: 'Fraud check' });
    expect((await state(o.orderId)).payment).toBe('REFUND_PENDING');
    expect(
      (await refund(o.orderId, { reason: 'Refund after cancellation' })).status,
    ).toBe(201);
    expect(await state(o.orderId)).toMatchObject({
      status: 'CANCELLED',
      payment: 'REFUNDED',
    });
  });

  it('FUL-12 permissions: STAFF can ship but not refund; customers neither', async () => {
    const o = await order();
    expect(
      (
        await ship(
          o.orderId,
          { items: [{ orderItemId: o.itemA, quantity: 1 }] },
          staff,
        )
      ).status,
    ).toBe(201);
    expect(
      (await refund(o.orderId, { amountPence: 100, reason: 'nope' }, staff))
        .status,
    ).toBe(403);
    expect((await ship(o.orderId, {}, o.customer)).status).toBe(403);

    // STAFF must not refund via status patch either.
    await ship(o.orderId, {});
    for (const status of ['DELIVERED', 'RETURN_REQUESTED', 'RETURNED']) {
      expect(
        (
          await h
            .http()
            .patch(`${API}/admin/orders/${o.orderId}/status`)
            .set(bearer(owner))
            .send({ status })
        ).status,
      ).toBe(200);
    }
    const viaStatus = await h
      .http()
      .patch(`${API}/admin/orders/${o.orderId}/status`)
      .set(bearer(staff))
      .send({ status: 'REFUNDED' });
    expect(viaStatus.status).toBe(403);
    expect(await state(o.orderId)).toMatchObject({ status: 'RETURNED' });
  });

  it('OUT-01 email delivery failure is retried by the cron until sent', async () => {
    h.mailer.failuresLeft = 1;
    const o = await order({ paid: false });
    await settle();
    const { rows } = await h.db.query(
      `select id, status, attempts, last_error from public.notification_outbox where recipient = $1 and event = 'ORDER_CREATED'`,
      [o.customer.email],
    );
    expect(rows[0]).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(rows[0].last_error).toContain('SMTP unavailable');
    await h.db.query(
      `update public.notification_outbox set next_attempt_at = now() where id = $1`,
      [rows[0].id],
    );
    const cron = await h
      .http()
      .get(`${API}/cron/release-expired-holds`)
      .set('Authorization', 'Bearer integration-cron-secret');
    expect(cron.body.data.emails.sent).toBeGreaterThanOrEqual(1);
    const { rows: after } = await h.db.query(
      `select status from public.notification_outbox where id = $1`,
      [rows[0].id],
    );
    expect(after[0].status).toBe('SENT');
    expect(h.sentEmails).toContainEqual({
      event: 'ORDER_CREATED',
      to: o.customer.email,
    });
  });

  it('OUT-02 a rolled-back change leaves no email behind', async () => {
    const customer = await createAuthUser(h);
    const p = await createProduct(h, owner, { stock: 1 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, 1);
    const res = await h
      .http()
      .post(`${API}/checkout/authenticated`)
      .set(bearer(customer))
      .set('X-Guest-Token', cart.guestToken)
      .send(
        checkoutBody(cart.cartId, standardId, customer.email, {
          expectedTotalPence: 1,
        }),
      );
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    const { rows } = await h.db.query(
      'select count(*)::int n from public.notification_outbox where recipient = $1',
      [customer.email],
    );
    expect(rows[0].n).toBe(0);
  });

  it('PAY-09 proof for a file that was never uploaded is refused; strangers still get 403', async () => {
    const o = await order({ paid: false });
    const missing = await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/payment-proofs`)
      .set(bearer(o.customer))
      .send({
        storagePath: `orders/${o.orderNumber}/ghost.png`,
        mime: 'image/png',
        sizeBytes: 10,
      });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('PROOF_FILE_MISSING');
    const stranger = await createAuthUser(h);
    const forbidden = await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/payment-proofs`)
      .set(bearer(stranger))
      .send({
        storagePath: `orders/${o.orderNumber}/ghost.png`,
        mime: 'image/png',
        sizeBytes: 10,
      });
    expect(forbidden.status).toBe(403);
  });
});
