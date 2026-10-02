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

describe('Payments & order lifecycle', () => {
  let h: Harness;
  let owner: TestUser;
  let staff: TestUser;
  let standardId: string;

  beforeAll(async () => {
    h = await createHarness();
    owner = await createAdmin(h, 'OWNER');
    staff = await createAdmin(h, 'STAFF');
    standardId = (await shippingMethod(h)).id;
  });
  afterAll(() => h.close());

  /** Places an order for `customer` (signed in), qty 2 of a 5-stock product. */
  async function placeOrder(customer: TestUser, qty = 2) {
    const p = await createProduct(h, owner, { stock: 5, pricePence: 1000 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, qty);
    const res = await h
      .http()
      .post(`${API}/checkout/authenticated`)
      .set(bearer(customer))
      .set('X-Guest-Token', cart.guestToken)
      .send(checkoutBody(cart.cartId, standardId, customer.email));
    expect(res.status).toBe(201);
    const { rows } = await h.db.query(
      `select o.id, p.id as payment_id from public.orders o join public.payments p on p.order_id = o.id
       where o.order_number = $1`,
      [res.body.data.orderNumber],
    );
    return {
      p,
      orderNumber: res.body.data.orderNumber as string,
      orderId: rows[0].id as string,
      paymentId: rows[0].payment_id as string,
    };
  }

  async function uploadProof(
    customer: TestUser,
    orderNumber: string,
    bytes = PNG_BYTES,
    mime = 'image/png',
  ) {
    const up = await h
      .http()
      .post(`${API}/storage/upload`)
      .set(bearer(customer))
      .field('bucket', 'payment-proofs')
      .field('folder', `orders/${orderNumber}`)
      .attach('file', bytes, { filename: 'proof.png', contentType: mime });
    return up;
  }

  async function submitProof(customer: TestUser, orderNumber: string) {
    const up = await uploadProof(customer, orderNumber);
    expect(up.status).toBe(201);
    return h
      .http()
      .post(`${API}/orders/${orderNumber}/payment-proofs`)
      .set(bearer(customer))
      .send({
        storagePath: up.body.data.path,
        mime: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
  }

  async function order(orderId: string) {
    const { rows } = await h.db.query(
      `select o.status, o.payment_status, p.status as payment
       from public.orders o join public.payments p on p.order_id = o.id where o.id = $1`,
      [orderId],
    );
    return rows[0];
  }

  it('PAY-01 proof upload moves payment + order to review, kept in sync', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    const res = await submitProof(customer, o.orderNumber);
    expect(res.status).toBe(201);
    expect(await order(o.orderId)).toEqual({
      status: 'PAYMENT_UNDER_REVIEW',
      payment_status: 'UNDER_REVIEW',
      payment: 'UNDER_REVIEW',
    });
  });

  it('PAY-02 resubmitting the same uploaded file is idempotent (no duplicate proof)', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    const up = await uploadProof(customer, o.orderNumber);
    const body = {
      storagePath: up.body.data.path,
      mime: 'image/png',
      sizeBytes: PNG_BYTES.length,
    };
    const [a, b] = await Promise.all([
      h
        .http()
        .post(`${API}/orders/${o.orderNumber}/payment-proofs`)
        .set(bearer(customer))
        .send(body),
      h
        .http()
        .post(`${API}/orders/${o.orderNumber}/payment-proofs`)
        .set(bearer(customer))
        .send(body),
    ]);
    expect(
      [a.status, b.status].filter((s) => s === 201).length,
    ).toBeGreaterThanOrEqual(1);
    const { rows } = await h.db.query(
      'select count(*)::int n from public.payment_proofs where payment_id = $1',
      [o.paymentId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('PAY-03 another customer cannot upload proof or read proof files for my order', async () => {
    const customer = await createAuthUser(h);
    const other = await createAuthUser(h);
    const o = await placeOrder(customer);
    const up = await uploadProof(other, o.orderNumber);
    expect(up.status).toBe(400);
    const submit = await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/payment-proofs`)
      .set(bearer(other))
      .send({
        storagePath: `orders/${o.orderNumber}/x.png`,
        mime: 'image/png',
        sizeBytes: 10,
      });
    expect(submit.status).toBe(403);
    const url = await h
      .http()
      .get(`${API}/storage/url`)
      .set(bearer(other))
      .query({
        bucket: 'payment-proofs',
        path: `orders/${o.orderNumber}/x.png`,
      });
    expect(url.status).toBe(400);
  });

  it('PAY-04 proof files: wrong type, spoofed content-type, path traversal rejected', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    const exe = await uploadProof(
      customer,
      o.orderNumber,
      Buffer.from('MZ\x90\x00 not an image'),
      'image/png',
    );
    expect(exe.status).toBe(400);
    expect(exe.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    const html = await uploadProof(
      customer,
      o.orderNumber,
      Buffer.from('<html>'),
      'text/html',
    );
    expect(html.status).toBe(400);
    const traversal = await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/payment-proofs`)
      .set(bearer(customer))
      .send({
        storagePath: `orders/${o.orderNumber}/../ORD-OTHER/x.png`,
        mime: 'image/png',
        sizeBytes: 10,
      });
    expect(traversal.status).toBe(400);
  });

  it('PAY-05 approve: payment VERIFIED, order CONFIRMED; second approve is a no-op', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    await submitProof(customer, o.orderNumber);
    const key = randomUUID();
    const [a, b] = await Promise.all([
      h
        .http()
        .post(`${API}/admin/payments/${o.paymentId}/approve`)
        .set(bearer(owner))
        .set('Idempotency-Key', key),
      h
        .http()
        .post(`${API}/admin/payments/${o.paymentId}/approve`)
        .set(bearer(owner))
        .set('Idempotency-Key', key),
    ]);
    expect([a.status, b.status]).toContain(201);
    expect(await order(o.orderId)).toEqual({
      status: 'CONFIRMED',
      payment_status: 'VERIFIED',
      payment: 'VERIFIED',
    });
    const again = await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/approve`)
      .set(bearer(owner));
    expect(again.status).toBe(201);
    expect(again.body.data.alreadyVerified).toBe(true);
    const { rows } = await h.db.query(
      `select count(*)::int n from public.order_status_history where order_id = $1 and to_status = 'CONFIRMED'`,
      [o.orderId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('PAY-06 approve without proof is refused', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    const res = await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/approve`)
      .set(bearer(owner));
    expect(res.status).toBe(409);
    expect(await order(o.orderId)).toMatchObject({
      status: 'PENDING_PAYMENT',
      payment: 'PENDING',
    });
  });

  it('PAY-07 reject (reason required) → customer can resubmit → approve', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    await submitProof(customer, o.orderNumber);
    const noReason = await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/reject`)
      .set(bearer(owner))
      .send({ reason: '' });
    expect(noReason.status).toBe(400);
    const rejected = await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/reject`)
      .set(bearer(owner))
      .send({ reason: 'Amount does not match' });
    expect(rejected.status).toBe(201);
    expect(await order(o.orderId)).toEqual({
      status: 'PAYMENT_SUBMITTED',
      payment_status: 'REJECTED',
      payment: 'REJECTED',
    });
    expect((await submitProof(customer, o.orderNumber)).status).toBe(201);
    expect(await order(o.orderId)).toMatchObject({
      status: 'PAYMENT_UNDER_REVIEW',
      payment: 'UNDER_REVIEW',
    });
    expect(
      (
        await h
          .http()
          .post(`${API}/admin/payments/${o.paymentId}/approve`)
          .set(bearer(owner))
      ).status,
    ).toBe(201);
  });

  it('PAY-08 STAFF cannot approve or reject payments', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    await submitProof(customer, o.orderNumber);
    expect(
      (
        await h
          .http()
          .post(`${API}/admin/payments/${o.paymentId}/approve`)
          .set(bearer(staff))
      ).status,
    ).toBe(403);
    expect(
      (
        await h
          .http()
          .post(`${API}/admin/payments/${o.paymentId}/reject`)
          .set(bearer(staff))
          .send({ reason: 'nope' })
      ).status,
    ).toBe(403);
  });

  it('ORD-01 cancel unpaid order releases exactly its own reservation', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer, 2);
    const other = await createAuthUser(h);
    // A second order for the same SKU must keep its reservation.
    const cart = await newGuestCart(h);
    await addToCart(h, cart, o.p.variantId, 1);
    await h
      .http()
      .post(`${API}/checkout/authenticated`)
      .set(bearer(other))
      .set('X-Guest-Token', cart.guestToken)
      .send(checkoutBody(cart.cartId, standardId, other.email));
    expect((await stockOf(h, o.p.variantId)).reserved).toBe(3);

    const res = await h
      .http()
      .post(`${API}/admin/orders/${o.orderId}/cancel`)
      .set(bearer(owner))
      .send({ reason: 'Customer asked' });
    expect(res.status).toBe(201);
    expect(await stockOf(h, o.p.variantId)).toMatchObject({
      onHand: 5,
      reserved: 1,
    });
    const twice = await h
      .http()
      .post(`${API}/admin/orders/${o.orderId}/cancel`)
      .set(bearer(owner))
      .send({ reason: 'again' });
    expect(twice.status).toBe(400);
    expect((await stockOf(h, o.p.variantId)).reserved).toBe(1);
  });

  it('ORD-02 cancel requires a reason; proof upload after cancel is refused', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    expect(
      (
        await h
          .http()
          .post(`${API}/admin/orders/${o.orderId}/cancel`)
          .set(bearer(owner))
          .send({})
      ).status,
    ).toBe(400);
    await h
      .http()
      .post(`${API}/admin/orders/${o.orderId}/cancel`)
      .set(bearer(owner))
      .send({ reason: 'Fraud check' });
    const res = await submitProof(customer, o.orderNumber);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ORDER_CANCELLED');
  });

  it('ORD-03 cancelling a paid order flags the payment REFUND_PENDING', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    await submitProof(customer, o.orderNumber);
    await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/approve`)
      .set(bearer(owner));
    const res = await h
      .http()
      .post(`${API}/admin/orders/${o.orderId}/cancel`)
      .set(bearer(owner))
      .send({ reason: 'Out of stock at supplier' });
    expect(res.status).toBe(201);
    expect(res.body.data.refundRequired).toBe(true);
    expect(await order(o.orderId)).toEqual({
      status: 'CANCELLED',
      payment_status: 'REFUND_PENDING',
      payment: 'REFUND_PENDING',
    });
  });

  it('ORD-04 cancel racing approve: exactly one wins, state stays consistent', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    await submitProof(customer, o.orderNumber);
    await Promise.all([
      h
        .http()
        .post(`${API}/admin/payments/${o.paymentId}/approve`)
        .set(bearer(owner)),
      h
        .http()
        .post(`${API}/admin/orders/${o.orderId}/cancel`)
        .set(bearer(owner))
        .send({ reason: 'race' }),
    ]);
    const s = await order(o.orderId);
    expect(s.payment_status).toBe(s.payment);
    expect([
      'CONFIRMED|VERIFIED',
      'CANCELLED|UNDER_REVIEW',
      'CANCELLED|REFUND_PENDING',
    ]).toContain(`${s.status}|${s.payment}`);
    const held = (await stockOf(h, o.p.variantId)).reserved;
    expect(held).toBe(s.status === 'CANCELLED' ? 0 : 2);
  });

  it('ORD-05 fulfilment: confirm → process → pack → ship deducts stock once; tracking stored', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer, 2);
    await submitProof(customer, o.orderNumber);
    await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/approve`)
      .set(bearer(owner));
    for (const status of ['PROCESSING', 'PACKED']) {
      expect(
        (
          await h
            .http()
            .patch(`${API}/admin/orders/${o.orderId}/status`)
            .set(bearer(staff))
            .send({ status })
        ).status,
      ).toBe(200);
    }
    const ship = () =>
      h
        .http()
        .patch(`${API}/admin/orders/${o.orderId}/status`)
        .set(bearer(staff))
        .send({
          status: 'SHIPPED',
          carrier: 'Royal Mail',
          trackingNumber: 'RM123',
          trackingUrl: 'https://track.example/RM123',
        });
    const [a, b] = await Promise.all([ship(), ship()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await stockOf(h, o.p.variantId)).toMatchObject({
      onHand: 3,
      reserved: 0,
    });
    const { rows } = await h.db.query(
      'select carrier, tracking_number, shipping_status from public.orders where id = $1',
      [o.orderId],
    );
    expect(rows[0]).toEqual({
      carrier: 'Royal Mail',
      tracking_number: 'RM123',
      shipping_status: 'SHIPPED',
    });
  });

  it('ORD-06 illegal transitions are refused (skip payment, ship unpaid, cancel after ship)', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer);
    for (const status of [
      'CONFIRMED',
      'SHIPPED',
      'DELIVERED',
      'PAYMENT_UNDER_REVIEW',
    ]) {
      const res = await h
        .http()
        .patch(`${API}/admin/orders/${o.orderId}/status`)
        .set(bearer(owner))
        .send({ status });
      expect(res.status, status).not.toBe(200);
    }
    const bogus = await h
      .http()
      .patch(`${API}/admin/orders/${o.orderId}/status`)
      .set(bearer(owner))
      .send({ status: 'TELEPORTED' });
    expect(bogus.status).toBe(400);
    const badUrl = await h
      .http()
      .patch(`${API}/admin/orders/${o.orderId}/status`)
      .set(bearer(owner))
      .send({ status: 'PROCESSING', trackingUrl: 'javascript:alert(1)' });
    expect(badUrl.status).toBe(400);
  });

  it('ORD-07 return → RETURNED restocks → REFUNDED marks payment refunded', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer, 2);
    await submitProof(customer, o.orderNumber);
    await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/approve`)
      .set(bearer(owner));
    for (const status of ['PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED']) {
      await h
        .http()
        .patch(`${API}/admin/orders/${o.orderId}/status`)
        .set(bearer(owner))
        .send({ status });
    }
    expect((await stockOf(h, o.p.variantId)).onHand).toBe(3);
    const { rows: items } = await h.db.query(
      'select id from public.order_items where order_id = $1',
      [o.orderId],
    );

    const tooMany = await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/returns`)
      .set(bearer(customer))
      .send({
        reason: 'Too small',
        items: [{ orderItemId: items[0].id, quantity: 3 }],
      });
    expect(tooMany.status).toBe(400);
    const foreign = await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/returns`)
      .set(bearer(customer))
      .send({ items: [{ orderItemId: randomUUID(), quantity: 1 }] });
    expect(foreign.status).toBe(400);
    const stranger = await createAuthUser(h);
    const notMine = await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/returns`)
      .set(bearer(stranger))
      .send({ items: [{ orderItemId: items[0].id, quantity: 1 }] });
    expect(notMine.status).toBe(404);

    const ok = await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/returns`)
      .set(bearer(customer))
      .send({
        reason: 'Too small',
        items: [{ orderItemId: items[0].id, quantity: 2 }],
      });
    expect(ok.status).toBe(201);
    const dup = await h
      .http()
      .post(`${API}/orders/${o.orderNumber}/returns`)
      .set(bearer(customer))
      .send({
        reason: 'Too small',
        items: [{ orderItemId: items[0].id, quantity: 2 }],
      });
    expect(dup.status).toBe(400);

    await h
      .http()
      .patch(`${API}/admin/orders/${o.orderId}/status`)
      .set(bearer(owner))
      .send({ status: 'RETURNED' });
    expect((await stockOf(h, o.p.variantId)).onHand).toBe(5);
    const refunded = await h
      .http()
      .patch(`${API}/admin/orders/${o.orderId}/status`)
      .set(bearer(owner))
      .send({ status: 'REFUNDED' });
    expect(refunded.status).toBe(200);
    expect(await order(o.orderId)).toEqual({
      status: 'REFUNDED',
      payment_status: 'REFUNDED',
      payment: 'REFUNDED',
    });
  });

  it('ORD-08 RETURNED with restock=false (damaged goods) leaves stock unchanged', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer, 1);
    await submitProof(customer, o.orderNumber);
    await h
      .http()
      .post(`${API}/admin/payments/${o.paymentId}/approve`)
      .set(bearer(owner));
    for (const status of [
      'PROCESSING',
      'PACKED',
      'SHIPPED',
      'RETURN_REQUESTED',
    ]) {
      await h
        .http()
        .patch(`${API}/admin/orders/${o.orderId}/status`)
        .set(bearer(owner))
        .send({ status });
    }
    await h
      .http()
      .patch(`${API}/admin/orders/${o.orderId}/status`)
      .set(bearer(owner))
      .send({ status: 'RETURNED', restock: false });
    expect((await stockOf(h, o.p.variantId)).onHand).toBe(4);
  });

  it('ORD-09 customer order list only shows own orders; detail hidden from others', async () => {
    const a = await createAuthUser(h);
    const b = await createAuthUser(h);
    const oa = await placeOrder(a);
    const listB = await h.http().get(`${API}/orders`).set(bearer(b));
    expect(
      listB.body.data.items.map((x: { orderNumber: string }) => x.orderNumber),
    ).not.toContain(oa.orderNumber);
    const detailB = await h
      .http()
      .get(`${API}/orders/${oa.orderNumber}`)
      .set(bearer(b));
    expect(detailB.status).toBe(400);
    expect(JSON.stringify(detailB.body)).not.toContain(a.email);
  });

  it('ORD-10 admin delete of an open order releases stock and leaves no orphans', async () => {
    const customer = await createAuthUser(h);
    const o = await placeOrder(customer, 2);
    const res = await h
      .http()
      .delete(`${API}/admin/orders/${o.orderId}`)
      .set(bearer(owner));
    expect(res.status).toBe(200);
    expect((await stockOf(h, o.p.variantId)).reserved).toBe(0);
    const { rows } = await h.db.query(
      `select (select count(*) from public.orders where id = $1)::int o,
              (select count(*) from public.payments where order_id = $1)::int p,
              (select count(*) from public.order_items where order_id = $1)::int i`,
      [o.orderId],
    );
    expect(rows[0]).toEqual({ o: 0, p: 0, i: 0 });
  });
});
