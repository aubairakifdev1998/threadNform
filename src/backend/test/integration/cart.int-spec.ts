import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API,
  addToCart,
  bearer,
  createAdmin,
  createAuthUser,
  createHarness,
  createProduct,
  newGuestCart,
  setSetting,
  stockOf,
  type Harness,
  type TestUser,
} from './harness.js';

describe('Cart', () => {
  let h: Harness;
  let owner: TestUser;

  beforeAll(async () => {
    h = await createHarness();
    owner = await createAdmin(h, 'OWNER');
  });
  afterAll(() => h.close());

  it('CART-01 add product holds stock and returns the line', async () => {
    const p = await createProduct(h, owner, { stock: 5, pricePence: 1999 });
    const cart = await newGuestCart(h);
    const res = await addToCart(h, cart, p.variantId, 2);
    expect(res.status).toBe(201);
    expect(res.body.data.quantity).toBe(2);
    expect(await stockOf(h, p.variantId)).toMatchObject({
      onHand: 5,
      reserved: 2,
    });

    const view = await h
      .http()
      .get(`${API}/carts/${cart.cartId}`)
      .set('X-Guest-Token', cart.guestToken);
    expect(view.status).toBe(200);
    expect(view.body.data.subtotalPence).toBe(3998);
    expect(view.body.data.items[0]).toMatchObject({
      quantity: 2,
      unitPricePence: 1999,
      inStock: true,
      availableQuantity: 5,
    });
  });

  it('CART-02 adding the same variant again increments the line', async () => {
    const p = await createProduct(h, owner, { stock: 5 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, 1);
    const res = await addToCart(h, cart, p.variantId, 2);
    expect(res.body.data.quantity).toBe(3);
    expect((await stockOf(h, p.variantId)).reserved).toBe(3);
  });

  it('CART-03 increase / decrease quantity moves the hold exactly', async () => {
    const p = await createProduct(h, owner, { stock: 5 });
    const cart = await newGuestCart(h);
    const line = (await addToCart(h, cart, p.variantId, 2)).body.data;
    const up = await h
      .http()
      .patch(`${API}/carts/${cart.cartId}/items/${line.id}`)
      .set('X-Guest-Token', cart.guestToken)
      .send({ quantity: 4 });
    expect(up.status).toBe(200);
    expect((await stockOf(h, p.variantId)).reserved).toBe(4);
    const down = await h
      .http()
      .patch(`${API}/carts/${cart.cartId}/items/${line.id}`)
      .set('X-Guest-Token', cart.guestToken)
      .send({ quantity: 1 });
    expect(down.status).toBe(200);
    expect((await stockOf(h, p.variantId)).reserved).toBe(1);
  });

  it('CART-04 remove product releases its hold', async () => {
    const p = await createProduct(h, owner, { stock: 5 });
    const cart = await newGuestCart(h);
    const line = (await addToCart(h, cart, p.variantId, 3)).body.data;
    const res = await h
      .http()
      .delete(`${API}/carts/${cart.cartId}/items/${line.id}`)
      .set('X-Guest-Token', cart.guestToken);
    expect(res.status).toBe(200);
    expect((await stockOf(h, p.variantId)).reserved).toBe(0);
  });

  it('CART-05 cannot add more than is in stock', async () => {
    const p = await createProduct(h, owner, { stock: 2 });
    const cart = await newGuestCart(h);
    const res = await addToCart(h, cart, p.variantId, 3);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details.available).toBe(2);
    expect((await stockOf(h, p.variantId)).reserved).toBe(0);
  });

  it('CART-06 out-of-stock product cannot be added', async () => {
    const p = await createProduct(h, owner, { stock: 0 });
    const res = await addToCart(h, await newGuestCart(h), p.variantId, 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it("CART-07 another cart's hold reduces what this cart can take", async () => {
    const p = await createProduct(h, owner, { stock: 3 });
    await addToCart(h, await newGuestCart(h), p.variantId, 2);
    const res = await addToCart(h, await newGuestCart(h), p.variantId, 2);
    expect(res.status).toBe(409);
    expect(res.body.error.details.available).toBe(1);
  });

  it('CART-08 line quantity is capped at 99', async () => {
    const p = await createProduct(h, owner, { stock: 500 });
    const cart = await newGuestCart(h);
    expect((await addToCart(h, cart, p.variantId, 100)).status).toBe(400);
    await addToCart(h, cart, p.variantId, 90);
    const res = await addToCart(h, cart, p.variantId, 10);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUANTITY_LIMIT');
  });

  it('CART-09 zero, negative and non-integer quantities are rejected', async () => {
    const p = await createProduct(h, owner, { stock: 5 });
    const cart = await newGuestCart(h);
    for (const quantity of [0, -1, 1.5, 'abc']) {
      const res = await addToCart(h, cart, p.variantId, quantity as number);
      expect(res.status, String(quantity)).toBe(400);
    }
  });

  it('CART-10 inactive / archived product cannot be added', async () => {
    const p = await createProduct(h, owner, { stock: 5 });
    await h
      .http()
      .patch(`${API}/admin/products/${p.productId}`)
      .set(bearer(owner))
      .send({ status: 'INACTIVE' });
    const res = await addToCart(h, await newGuestCart(h), p.variantId, 1);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VARIANT_UNAVAILABLE');
  });

  it('CART-11 unknown variant is rejected', async () => {
    const res = await addToCart(
      h,
      await newGuestCart(h),
      '00000000-0000-4000-8000-000000000000',
      1,
    );
    expect(res.status).toBe(400);
  });

  it('CART-12 wrong or missing guest token cannot read or modify a cart', async () => {
    const p = await createProduct(h, owner, { stock: 5 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, 1);
    const other = await newGuestCart(h);

    const read = await h
      .http()
      .get(`${API}/carts/${cart.cartId}`)
      .set('X-Guest-Token', other.guestToken);
    expect(read.status).toBe(404);
    const noToken = await h.http().get(`${API}/carts/${cart.cartId}`);
    expect(noToken.status).toBe(400);
    const write = await addToCart(
      h,
      { cartId: cart.cartId, guestToken: other.guestToken },
      p.variantId,
      1,
    );
    expect(write.status).toBe(404);
    expect((await stockOf(h, p.variantId)).reserved).toBe(1);
  });

  it('CART-13 malformed cart / item ids return 400, not 500', async () => {
    const cart = await newGuestCart(h);
    const res = await h
      .http()
      .get(`${API}/carts/not-a-uuid`)
      .set('X-Guest-Token', cart.guestToken);
    expect(res.status).toBe(400);
    const item = await h
      .http()
      .patch(`${API}/carts/${cart.cartId}/items/not-a-uuid`)
      .set('X-Guest-Token', cart.guestToken)
      .send({ quantity: 1 });
    expect(item.status).toBe(400);
  });

  it('CART-14 concurrent adds of the same variant never lose an update', async () => {
    const p = await createProduct(h, owner, { stock: 50 });
    const cart = await newGuestCart(h);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => addToCart(h, cart, p.variantId, 1)),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const view = await h
      .http()
      .get(`${API}/carts/${cart.cartId}`)
      .set('X-Guest-Token', cart.guestToken);
    expect(view.body.data.items[0].quantity).toBe(8);
    expect((await stockOf(h, p.variantId)).reserved).toBe(8);
  });

  it('CART-15 concurrent shoppers cannot oversell the last units', async () => {
    const p = await createProduct(h, owner, { stock: 3 });
    const carts = await Promise.all(
      Array.from({ length: 6 }, () => newGuestCart(h)),
    );
    const results = await Promise.all(
      carts.map((c) => addToCart(h, c, p.variantId, 1)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await stockOf(h, p.variantId)).toMatchObject({
      onHand: 3,
      reserved: 3,
    });
  });

  it('CART-16 product deactivated after adding is flagged in the cart and excluded from subtotal', async () => {
    const p = await createProduct(h, owner, { stock: 5, pricePence: 1000 });
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, 1);
    await h
      .http()
      .patch(`${API}/admin/products/${p.productId}`)
      .set(bearer(owner))
      .send({ status: 'INACTIVE' });
    const view = await h
      .http()
      .get(`${API}/carts/${cart.cartId}`)
      .set('X-Guest-Token', cart.guestToken);
    expect(view.body.data.items[0]).toMatchObject({
      purchasable: false,
      inStock: false,
    });
    expect(view.body.data.subtotalPence).toBe(0);
    expect(view.body.data.hasUnavailableItems).toBe(true);
  });

  it('CART-17 sale price below base is charged (cart matches checkout pricing)', async () => {
    const p = await createProduct(h, owner, { stock: 5, pricePence: 1000 });
    await h.db.query(
      'update public.product_prices set sale_price_pence = 800 where variant_id = $1',
      [p.variantId],
    );
    const cart = await newGuestCart(h);
    await addToCart(h, cart, p.variantId, 2);
    const view = await h
      .http()
      .get(`${API}/carts/${cart.cartId}`)
      .set('X-Guest-Token', cart.guestToken);
    expect(view.body.data.items[0].unitPricePence).toBe(800);
    expect(view.body.data.subtotalPence).toBe(1600);
  });

  it('CART-18 merge into a customer cart moves lines and stock holds', async () => {
    const p = await createProduct(h, owner, { stock: 5 });
    const guest = await newGuestCart(h);
    await addToCart(h, guest, p.variantId, 2);
    const user: TestUser = await createAuthUser(h);
    const res = await h
      .http()
      .post(`${API}/carts/merge`)
      .set(bearer(user))
      .send({ guestToken: guest.guestToken });
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].quantity).toBe(2);
    expect((await stockOf(h, p.variantId)).reserved).toBe(2);
    const { rows } = await h.db.query(
      `select reference_id, sum(quantity_delta)::int held from public.inventory_movements
       where variant_id = $1 and reference_type = 'CART' group by reference_id having sum(quantity_delta) > 0`,
      [p.variantId],
    );
    expect(rows).toEqual([{ reference_id: res.body.data.id, held: 2 }]);
  });

  it('CART-19 reserve-on-cart off: adding does not hold stock but still checks it', async () => {
    await setSetting(h, owner, 'inventory', { reserveOnCart: false });
    try {
      const p = await createProduct(h, owner, { stock: 2 });
      const cart = await newGuestCart(h);
      expect((await addToCart(h, cart, p.variantId, 2)).status).toBe(201);
      expect((await stockOf(h, p.variantId)).reserved).toBe(0);
      expect((await addToCart(h, cart, p.variantId, 1)).status).toBe(409);
    } finally {
      await setSetting(h, owner, 'inventory', { reserveOnCart: true });
    }
  });
});
