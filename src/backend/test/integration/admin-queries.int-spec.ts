import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API,
  bearer,
  createAdmin,
  createHarness,
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
});
