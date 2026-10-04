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
  type Harness,
  type TestUser,
} from './harness.js';

/**
 * End-to-end CRUD for catalog entities + site content + admin order detail.
 * Complements products-crud / admin-queries with the remaining admin surfaces
 * the storefront and admin portal actually call.
 */
describe('Catalog, site content & order-detail CRUD', () => {
  let h: Harness;
  let owner: TestUser;
  let staff: TestUser;
  let standardId: string;

  const tag = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    h = await createHarness();
    owner = await createAdmin(h, 'OWNER');
    staff = await createAdmin(h, 'STAFF');
    standardId = (await shippingMethod(h)).id;
  });
  afterAll(() => h.close());

  const as = (user: TestUser) => ({
    get: (path: string) => h.http().get(`${API}/${path}`).set(bearer(user)),
    post: (path: string, body?: object) =>
      h.http().post(`${API}/${path}`).set(bearer(user)).send(body ?? {}),
    patch: (path: string, body: object) =>
      h.http().patch(`${API}/${path}`).set(bearer(user)).send(body),
    del: (path: string) => h.http().delete(`${API}/${path}`).set(bearer(user)),
  });
  const admin = () => as(owner);

  describe('departments / categories / brands / collections', () => {
    it('CRUD department + category via admin APIs; public lists see them', async () => {
      const t = tag();
      const dept = await admin().post('admin/departments', {
        name: `Dept ${t}`,
        slug: `dept-${t}`,
        sortOrder: 10,
      });
      expect(dept.status, dept.text).toBe(201);
      const departmentId = dept.body.data.id as string;

      const renamed = await admin().patch(`admin/departments/${departmentId}`, {
        name: `Dept ${t} Renamed`,
        isActive: true,
      });
      expect(renamed.status, renamed.text).toBe(200);
      expect(renamed.body.data.name).toContain('Renamed');

      const cat = await admin().post('admin/categories', {
        departmentId,
        name: `Cat ${t}`,
        slug: `cat-${t}`,
      });
      expect(cat.status, cat.text).toBe(201);
      const categoryId = cat.body.data.id as string;

      const catPatch = await admin().patch(`admin/categories/${categoryId}`, {
        name: `Cat ${t} Updated`,
      });
      expect(catPatch.status, catPatch.text).toBe(200);

      const publicDepts = await h.http().get(`${API}/departments`);
      expect(publicDepts.status).toBe(200);
      expect(
        (publicDepts.body.data as Array<{ id: string }>).some(
          (d) => d.id === departmentId,
        ),
      ).toBe(true);

      const publicCats = await h.http().get(`${API}/categories`);
      expect(publicCats.status).toBe(200);
      expect(
        (publicCats.body.data as Array<{ id: string }>).some(
          (c) => c.id === categoryId,
        ),
      ).toBe(true);

      const deleted = await admin().del(`admin/categories/${categoryId}`);
      expect(deleted.status, deleted.text).toBe(200);
    });

    it('creates brands and collections; public lists include them', async () => {
      const t = tag();
      const brand = await admin().post('admin/brands', {
        name: `Brand ${t}`,
        slug: `brand-${t}`,
        description: 'QA brand',
      });
      expect(brand.status, brand.text).toBe(201);
      const brandId = brand.body.data.id as string;

      const collection = await admin().post('admin/collections', {
        name: `Collection ${t}`,
        slug: `collection-${t}`,
      });
      expect(collection.status, collection.text).toBe(201);
      const collectionId = collection.body.data.id as string;

      const brands = await h.http().get(`${API}/brands`);
      const collections = await h.http().get(`${API}/collections`);
      expect(brands.status).toBe(200);
      expect(collections.status).toBe(200);
      expect(
        (brands.body.data as Array<{ id: string }>).some((b) => b.id === brandId),
      ).toBe(true);
      expect(
        (collections.body.data as Array<{ id: string }>).some(
          (c) => c.id === collectionId,
        ),
      ).toBe(true);
    });
  });

  describe('colors & sizes', () => {
    it('CRUD colour via admin API', async () => {
      const t = tag();
      const created = await admin().post('admin/colors', {
        name: `Teal ${t}`,
        hex: '#008080',
      });
      expect(created.status, created.text).toBe(201);
      const id = created.body.data.id as string;

      const patched = await admin().patch(`admin/colors/${id}`, {
        name: `Teal ${t} Dark`,
        hex: '#004040',
      });
      expect(patched.status, patched.text).toBe(200);
      expect(patched.body.data.name).toContain('Dark');

      const listed = await h.http().get(`${API}/colors`);
      expect(listed.status).toBe(200);
      expect(
        (listed.body.data as Array<{ id: string }>).some((c) => c.id === id),
      ).toBe(true);

      const deleted = await admin().del(`admin/colors/${id}`);
      expect(deleted.status, deleted.text).toBe(200);
    });

    it('CRUD size value via admin API', async () => {
      const t = tag();
      const created = await admin().post('admin/sizes', {
        code: `XS-${t}`.slice(0, 16),
        label: `XS ${t}`,
      });
      expect(created.status, created.text).toBe(201);
      const id = created.body.data.id as string;

      const patched = await admin().patch(`admin/sizes/${id}`, {
        label: `Extra Small ${t}`,
        sortOrder: 0,
      });
      expect(patched.status, patched.text).toBe(200);
      expect(patched.body.data.label).toContain('Extra Small');

      const listed = await h.http().get(`${API}/sizes`);
      expect(listed.status).toBe(200);
      expect(
        (listed.body.data as Array<{ id: string }>).some((s) => s.id === id),
      ).toBe(true);

      const deleted = await admin().del(`admin/sizes/${id}`);
      expect(deleted.status, deleted.text).toBe(200);
    });
  });

  describe('site billboards & reviews', () => {
    it('CRUD billboard: create, activate, public read, delete', async () => {
      const t = tag();
      const created = await admin().post('admin/site/billboards', {
        title: `Hero ${t}`,
        subtitle: 'Season drop',
        ctaLabel: 'Shop',
        ctaHref: '/shop',
        mediaType: 'IMAGE',
        mediaUrl: 'https://cdn.example.test/hero.jpg',
        isActive: false,
      });
      expect(created.status, created.text).toBe(201);
      const id = created.body.data.id as string;

      const listed = await admin().get('admin/site/billboards');
      expect(listed.status).toBe(200);
      expect(
        (listed.body.data as Array<{ id: string }>).some((b) => b.id === id),
      ).toBe(true);

      const activated = await admin().post(
        `admin/site/billboards/${id}/activate`,
      );
      expect(activated.status, activated.text).toBe(201);

      const publicBillboard = await h.http().get(`${API}/site/billboard`);
      expect(publicBillboard.status).toBe(200);
      expect(publicBillboard.body.data?.id).toBe(id);
      expect(publicBillboard.body.data?.title).toBe(`Hero ${t}`);

      const deleted = await admin().del(`admin/site/billboards/${id}`);
      expect(deleted.status).toBe(204);

      const after = await h.http().get(`${API}/site/billboard`);
      expect(after.status).toBe(200);
      expect(after.body.data?.id ?? null).not.toBe(id);
    });

    it('CRUD review: create, publish, public list, update, delete', async () => {
      const t = tag();
      const created = await admin().post('admin/site/reviews', {
        customerName: `Pat ${t}`,
        rating: 5,
        title: 'Loved it',
        body: 'Perfect fit and fabric.',
        location: 'London',
        isPublished: false,
      });
      expect(created.status, created.text).toBe(201);
      const id = created.body.data.id as string;

      const unpublished = await h.http().get(`${API}/site/reviews`);
      expect(unpublished.status).toBe(200);
      expect(
        (unpublished.body.data as Array<{ id: string }>).some(
          (r) => r.id === id,
        ),
      ).toBe(false);

      const published = await admin().patch(`admin/site/reviews/${id}`, {
        isPublished: true,
        rating: 4,
      });
      expect(published.status, published.text).toBe(200);
      expect(published.body.data.isPublished).toBe(true);
      expect(published.body.data.rating).toBe(4);

      const publicReviews = await h.http().get(`${API}/site/reviews`);
      expect(publicReviews.status).toBe(200);
      expect(
        (publicReviews.body.data as Array<{ id: string }>).some(
          (r) => r.id === id,
        ),
      ).toBe(true);

      const adminList = await admin().get('admin/site/reviews');
      expect(adminList.status).toBe(200);
      expect(
        (adminList.body.data as Array<{ id: string }>).some((r) => r.id === id),
      ).toBe(true);

      const deleted = await admin().del(`admin/site/reviews/${id}`);
      expect(deleted.status).toBe(204);
    });

    it('STAFF without CATALOG_WRITE cannot mutate site content', async () => {
      const res = await as(staff).post('admin/site/reviews', {
        customerName: 'Nope',
        rating: 5,
        body: 'blocked',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('admin order detail', () => {
    it('GET /admin/orders/:id returns header, items, payment proofs, empty fulfilment', async () => {
      const customer = await createAuthUser(h);
      const product = await createProduct(h, owner, {
        stock: 5,
        pricePence: 1500,
      });
      const cart = await newGuestCart(h);
      await addToCart(h, cart, product.variantId, 1);
      const placed = await h
        .http()
        .post(`${API}/checkout/authenticated`)
        .set(bearer(customer))
        .set('X-Guest-Token', cart.guestToken)
        .send(checkoutBody(cart.cartId, standardId, customer.email));
      expect(placed.status).toBe(201);
      const orderNumber = placed.body.data.orderNumber as string;

      const { rows } = await h.db.query(
        `select o.id, p.id as payment_id from public.orders o
         join public.payments p on p.order_id = o.id
         where o.order_number = $1`,
        [orderNumber],
      );
      const orderId = rows[0].id as string;
      const paymentId = rows[0].payment_id as string;

      const path = `orders/${orderNumber}/proof.png`;
      h.storage.set(`payment-proofs/${path}`, PNG_BYTES);
      const proof = await h
        .http()
        .post(`${API}/orders/${orderNumber}/payment-proofs`)
        .set(bearer(customer))
        .send({
          storagePath: path,
          mime: 'image/png',
          sizeBytes: PNG_BYTES.length,
        });
      expect(proof.status).toBe(201);

      // Empty mime must not 500 when signing proof URLs (isImage stays false).
      await h.db.query(
        `update public.payment_proofs set mime = '' where payment_id = $1`,
        [paymentId],
      );

      const detail = await admin().get(`admin/orders/${orderId}`);
      expect(detail.status, detail.text).toBe(200);
      expect(detail.body.data).toMatchObject({
        id: orderId,
        orderNumber,
        email: customer.email,
        items: expect.any(Array),
        shipments: [],
        refunds: [],
        timeline: expect.any(Array),
      });
      expect(detail.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(detail.body.data.payment).toMatchObject({
        id: paymentId,
        proofs: expect.any(Array),
      });
      expect(detail.body.data.payment.proofs[0]).toMatchObject({
        isImage: false,
        url: expect.stringContaining('storage.test'),
      });
      expect(detail.body.data.shippingAddress).toMatchObject({
        postcode: 'SW1A 2AA',
        city: 'London',
      });

      const missing = await admin().get(
        'admin/orders/00000000-0000-4000-8000-000000000000',
      );
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');

      const bad = await admin().get('admin/orders/not-a-uuid');
      expect(bad.status).toBe(400);
    });
  });
});
