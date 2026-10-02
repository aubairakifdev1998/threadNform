import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API,
  bearer,
  createAdmin,
  createHarness,
  createProduct,
  type Harness,
  type TestUser,
} from './harness.js';

describe('Admin list filters & search', () => {
  let h: Harness;
  let owner: TestUser;
  beforeAll(async () => {
    h = await createHarness();
    owner = await createAdmin(h, 'OWNER');
  });
  afterAll(() => h.close());

  it.each([
    'admin/orders?status=CONFIRMED,PROCESSING&paymentStatus=VERIFIED&q=ORD',
    'admin/payments/queue?status=queue&q=ORD&hasProof=true',
    'admin/products?q=shirt&status=ACTIVE',
    'admin/customers?q=example',
    'admin/inventory?warehouseId=00000000-0000-4000-8000-000000000000',
    'admin/inventory/movements?variantId=00000000-0000-4000-8000-000000000000',
  ])('QRY %s is accepted', async (path) => {
    const res = await h.http().get(`${API}/${path}`).set(bearer(owner));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('QRY admin/products accepts a comma-separated status list', async () => {
    const p = await createProduct(h, owner);
    await h.db.query(
      `update public.products set status = 'ARCHIVED' where id = $1`,
      [p.productId],
    );
    const ids = async (status: string) => {
      const res = await h
        .http()
        .get(`${API}/admin/products`)
        .query({ status, pageSize: 100 })
        .set(bearer(owner));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return (res.body.data.items as Array<{ id: string; status: string }>);
    };
    const live = await ids('DRAFT,ACTIVE,INACTIVE');
    expect(live.map((i) => i.id)).not.toContain(p.productId);
    expect(live.every((i) => i.status !== 'ARCHIVED')).toBe(true);
    expect((await ids('ARCHIVED')).map((i) => i.id)).toContain(p.productId);
    expect(await ids('NOT_A_STATUS')).toEqual([]);
  });

  it('QRY admin/inventory filters by product and paginates server-side', async () => {
    const a = await createProduct(h, owner, { stock: 3 });
    await createProduct(h, owner, { stock: 4 });
    const res = await h
      .http()
      .get(`${API}/admin/inventory`)
      .query({ productId: a.productId })
      .set(bearer(owner));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0]).toMatchObject({
      productId: a.productId,
      variantId: a.variantId,
      onHand: 3,
    });

    const paged = await h
      .http()
      .get(`${API}/admin/inventory`)
      .query({ page: 2, pageSize: 1 })
      .set(bearer(owner));
    expect(paged.body.data.items).toHaveLength(1);
    expect(paged.body.data.total).toBeGreaterThanOrEqual(2);

    const bad = await h
      .http()
      .get(`${API}/admin/inventory`)
      .query({ productId: 'not-a-uuid' })
      .set(bearer(owner));
    expect(bad.status).toBe(400);
  });
});
