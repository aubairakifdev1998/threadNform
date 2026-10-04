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

describe('Security hardening (bank details, audit, storage, returns)', () => {
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

  it('SEC bank-details rejects bare Bearer without cart access', async () => {
    const user = await createAuthUser(h);
    const bare = await h
      .http()
      .get(`${API}/checkout/bank-details`)
      .set(bearer(user));
    expect(bare.status).toBeGreaterThanOrEqual(400);

    const cart = await newGuestCart(h);
    const ok = await h
      .http()
      .get(`${API}/checkout/bank-details`)
      .query({ cartId: cart.cartId })
      .set('X-Guest-Token', cart.guestToken);
    expect(ok.status).toBe(200);
    expect(ok.body.data.accountNumber).toBeTruthy();
  });

  it('SEC audit-logs: OWNER can list; STAFF cannot', async () => {
    await h.db.query(
      `insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id)
       values ('ADMIN', $1, 'TEST_ACTION', 'product', 'abc')`,
      [owner.id],
    );
    const ok = await h
      .http()
      .get(`${API}/admin/audit-logs`)
      .query({ pageSize: 10 })
      .set(bearer(owner));
    expect(ok.status, ok.text).toBe(200);
    expect(
      (ok.body.data.items as Array<{ action: string }>).some(
        (r) => r.action === 'TEST_ACTION',
      ),
    ).toBe(true);

    const denied = await h
      .http()
      .get(`${API}/admin/audit-logs`)
      .set(bearer(staff));
    expect(denied.status).toBe(403);
  });

  it('SEC product upload rejects path traversal in folder', async () => {
    const up = await h
      .http()
      .post(`${API}/storage/upload`)
      .set(bearer(owner))
      .field('bucket', 'products')
      .field('folder', '../evil')
      .attach('file', PNG_BYTES, {
        filename: 'x.png',
        contentType: 'image/png',
      });
    expect(up.status).toBeGreaterThanOrEqual(400);
  });

  it('SEC return qty cannot exceed shipped units', async () => {
    const customer = await createAuthUser(h);
    const p = await createProduct(h, owner, { stock: 5, pricePence: 1000 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, 3);
    const placed = await h
      .http()
      .post(`${API}/checkout/authenticated`)
      .set(bearer(customer))
      .set('X-Guest-Token', cart.guestToken)
      .send(checkoutBody(cart.cartId, standardId, customer.email));
    expect(placed.status).toBe(201);
    const orderNumber = placed.body.data.orderNumber as string;
    const { rows } = await h.db.query(
      `select o.id, p.id payment_id from public.orders o
       join public.payments p on p.order_id = o.id where o.order_number = $1`,
      [orderNumber],
    );
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
    await h
      .http()
      .post(`${API}/admin/payments/${rows[0].payment_id}/approve`)
      .set(bearer(owner));

    const { rows: items } = await h.db.query(
      `select id from public.order_items where order_id = $1`,
      [rows[0].id],
    );
    // Partial ship leaves status PARTIALLY_SHIPPED — returns not open yet.
    await h
      .http()
      .post(`${API}/admin/orders/${rows[0].id}/shipments`)
      .set(bearer(owner))
      .send({ items: [{ orderItemId: items[0].id, quantity: 1 }] });
    const early = await h
      .http()
      .post(`${API}/orders/${orderNumber}/returns`)
      .set(bearer(customer))
      .send({
        reason: 'Too soon',
        items: [{ orderItemId: items[0].id, quantity: 1 }],
      });
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('RETURN_NOT_ALLOWED');

    // Finish shipping so returns open; qty still capped by shipped units.
    await h
      .http()
      .post(`${API}/admin/orders/${rows[0].id}/shipments`)
      .set(bearer(owner))
      .send({ items: [{ orderItemId: items[0].id, quantity: 2 }] });

    const over = await h
      .http()
      .post(`${API}/orders/${orderNumber}/returns`)
      .set(bearer(customer))
      .send({
        reason: 'Too many',
        items: [{ orderItemId: items[0].id, quantity: 4 }],
      });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('RETURN_QUANTITY_INVALID');

    const ok = await h
      .http()
      .post(`${API}/orders/${orderNumber}/returns`)
      .set(bearer(customer))
      .send({
        reason: 'Fit',
        items: [{ orderItemId: items[0].id, quantity: 1 }],
      });
    expect(ok.status).toBe(201);
  });
});
