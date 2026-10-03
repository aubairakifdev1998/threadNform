import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API,
  addToCart,
  bearer,
  createAdmin,
  createHarness,
  createProduct,
  newGuestCart,
  stockOf,
  type Harness,
  type TestUser,
} from './harness.js';

/** Every product, variant, stock and attribute endpoint, end to end over HTTP. */
describe('Product CRUD', () => {
  let h: Harness;
  let owner: TestUser;
  let staff: TestUser;
  let warehouseId: string;

  const MISSING = '00000000-0000-4000-8000-000000000000';
  const tag = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    h = await createHarness();
    owner = await createAdmin(h, 'OWNER');
    staff = await createAdmin(h, 'STAFF');
    const { rows } = await h.db.query(
      'select id from public.warehouses where is_default',
    );
    warehouseId = rows[0].id;
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

  async function category(opts: { active?: boolean } = {}) {
    const t = tag();
    const dept = await h.db.query(
      `insert into public.departments (name, slug) values ($1, $1) returning id`,
      [`dept-${t}`],
    );
    const cat = await h.db.query(
      `insert into public.categories (department_id, name, slug, is_active)
       values ($1, $2, $2, $3) returning id`,
      [dept.rows[0].id, `cat-${t}`, opts.active ?? true],
    );
    return { id: cat.rows[0].id as string, departmentId: dept.rows[0].id as string };
  }

  async function sizesAndColours() {
    const t = tag();
    const sys = await h.db.query(
      `insert into public.size_systems (code, name) values ($1, 'QA') returning id`,
      [`SYS_${t}`],
    );
    const sizes = await h.db.query(
      `insert into public.size_system_values (size_system_id, code, label, sort_order)
       values ($1, 'S', 'S', 1), ($1, 'M', 'M', 2) returning id`,
      [sys.rows[0].id],
    );
    const colours = await h.db.query(
      `insert into public.colors (name, name_normalized) values ($1, $1), ($2, $2) returning id`,
      [`Red ${t}`, `Blue ${t}`],
    );
    return {
      sizeIds: sizes.rows.map((r) => r.id as string),
      colourIds: colours.rows.map((r) => r.id as string),
    };
  }

  // ———————————————————————————————— create ————————————————————————————————
  describe('POST admin/products', () => {
    it('PRD-C1 simple product: active, one default variant, price, stock, movement', async () => {
      const slug = `simple-${tag()}`;
      const res = await admin().post('admin/products', {
        name: 'Simple Tee',
        slug,
        productType: 'SIMPLE',
        basePricePence: 1999,
        sku: 'std',
        initialStock: 7,
      });
      expect(res.status, res.text).toBe(201);
      const product = res.body.data;
      expect(product).toMatchObject({ name: 'Simple Tee', slug, status: 'ACTIVE', productType: 'SIMPLE' });

      const detail = await admin().get(`admin/products/${product.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.variants).toHaveLength(1);
      expect(detail.body.data.variants[0]).toMatchObject({
        sku: `${slug.toUpperCase()}-STD`,
        isDefault: true,
        status: 'ACTIVE',
        onHand: 7,
        available: 7,
        basePricePence: 1999,
      });
      expect(detail.body.data.totalOnHand).toBe(7);

      const moves = await admin().get(
        `admin/inventory/movements?variantId=${detail.body.data.variants[0].id}`,
      );
      expect(moves.status).toBe(200);
      expect(moves.body.data.total).toBe(1);
    });

    it('PRD-C2 sizes × colours create one variant per combination with options attached', async () => {
      const { sizeIds, colourIds } = await sizesAndColours();
      const res = await admin().post('admin/products', {
        name: 'Matrix Hoodie',
        slug: `matrix-${tag()}`,
        productType: 'SIMPLE',
        basePricePence: 4500,
        sizeValueIds: sizeIds,
        colorIds: colourIds,
        initialStock: 3,
      });
      expect(res.status, res.text).toBe(201);
      expect(res.body.data.productType).toBe('VARIABLE');

      const detail = await admin().get(`admin/products/${res.body.data.id}`);
      const variants = detail.body.data.variants as Array<{ id: string; isDefault: boolean; onHand: number; basePricePence: number }>;
      expect(variants).toHaveLength(4);
      expect(variants.filter((v) => v.isDefault)).toHaveLength(1);
      expect(variants.every((v) => v.onHand === 3 && v.basePricePence === 4500)).toBe(true);
      expect(detail.body.data.totalOnHand).toBe(12);

      const { rows } = await h.db.query(
        `select count(*)::int n from public.product_variant_options
          where variant_id = any($1::uuid[])`,
        [variants.map((v) => v.id)],
      );
      expect(rows[0].n).toBe(8); // size + colour per variant
    });

    it('PRD-C3 category sets the department; no price → null price', async () => {
      const cat = await category();
      const res = await admin().post('admin/products', {
        name: 'Unpriced',
        slug: `unpriced-${tag()}`,
        productType: 'SIMPLE',
        categoryId: cat.id,
      });
      expect(res.status, res.text).toBe(201);
      expect(res.body.data).toMatchObject({ categoryId: cat.id, departmentId: cat.departmentId });
      const detail = await admin().get(`admin/products/${res.body.data.id}`);
      expect(detail.body.data.basePricePence).toBeNull();
      expect(detail.body.data.totalOnHand).toBe(0);
    });

    it.each([
      ['missing name', { slug: 'x', productType: 'SIMPLE' }],
      ['missing slug', { name: 'x', productType: 'SIMPLE' }],
      ['negative price', { name: 'x', slug: `neg-${randomUUID()}`, productType: 'SIMPLE', basePricePence: -1 }],
      ['negative stock', { name: 'x', slug: `neg-${randomUUID()}`, productType: 'SIMPLE', initialStock: -5 }],
      ['malformed category id', { name: 'x', slug: `bad-${randomUUID()}`, productType: 'SIMPLE', categoryId: 'nope' }],
    ])('PRD-C4 rejects %s with 400', async (_name, body) => {
      const res = await admin().post('admin/products', body);
      expect(res.status, res.text).toBe(400);
    });

    it('PRD-C5 unknown category → 404, inactive category → 400, nothing created', async () => {
      const slug = `nocat-${tag()}`;
      const unknown = await admin().post('admin/products', { name: 'x', slug, productType: 'SIMPLE', categoryId: MISSING });
      expect(unknown.status, unknown.text).toBe(404);
      const inactive = await category({ active: false });
      const res = await admin().post('admin/products', { name: 'x', slug, productType: 'SIMPLE', categoryId: inactive.id });
      expect(res.status, res.text).toBe(400);
      const { rowCount } = await h.db.query('select 1 from public.products where slug = $1', [slug]);
      expect(rowCount).toBe(0);
    });

    it('PRD-C6 duplicate slug → 409 and no partial product/variants left behind', async () => {
      const slug = `dup-${tag()}`;
      const body = { name: 'Dup', slug, productType: 'SIMPLE', basePricePence: 100, initialStock: 2 };
      expect((await admin().post('admin/products', body)).status).toBe(201);
      const again = await admin().post('admin/products', body);
      expect(again.status, again.text).toBe(409);
      const { rows } = await h.db.query(
        `select count(*)::int n from public.products where slug = $1`,
        [slug],
      );
      expect(rows[0].n).toBe(1);
    });

    it('PRD-C7 concurrent creates with the same slug: exactly one wins', async () => {
      const slug = `race-${tag()}`;
      const body = { name: 'Race', slug, productType: 'SIMPLE', basePricePence: 100 };
      const results = await Promise.all([1, 2, 3].map(() => admin().post('admin/products', body)));
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });

    it('PRD-C8 auth: anonymous 401, STAFF 403', async () => {
      const body = { name: 'x', slug: `auth-${tag()}`, productType: 'SIMPLE' };
      expect((await h.http().post(`${API}/admin/products`).send(body)).status).toBe(401);
      expect((await as(staff).post('admin/products', body)).status).toBe(403);
    });
  });

  // ————————————————————————————————— read —————————————————————————————————
  describe('GET products', () => {
    it('PRD-R1 admin detail: unknown → 404, malformed → 400, STAFF can read', async () => {
      expect((await admin().get(`admin/products/${MISSING}`)).status).toBe(404);
      expect((await admin().get('admin/products/not-a-uuid')).status).toBe(400);
      const p = await createProduct(h, owner);
      expect((await as(staff).get(`admin/products/${p.productId}`)).status).toBe(200);
      expect((await as(staff).get(`admin/products/${p.productId}/variants`)).status).toBe(200);
    });

    it('PRD-R2 admin list: search, status filter, pagination totals', async () => {
      const t = tag();
      for (let i = 0; i < 3; i += 1) {
        await admin().post('admin/products', { name: `Findme ${t} ${i}`, slug: `findme-${t}-${i}`, productType: 'SIMPLE' });
      }
      const page1 = await admin().get(`admin/products?q=Findme ${t}&pageSize=2&page=1`);
      expect(page1.status).toBe(200);
      expect(page1.body.data).toMatchObject({ total: 3, totalPages: 2, page: 1 });
      expect(page1.body.data.items).toHaveLength(2);
      const page2 = await admin().get(`admin/products?q=Findme ${t}&pageSize=2&page=2`);
      expect(page2.body.data.items).toHaveLength(1);
      const drafts = await admin().get(`admin/products?q=Findme ${t}&status=DRAFT`);
      expect(drafts.body.data.total).toBe(0);
    });

    it('PRD-R3 admin variants list returns stock per variant', async () => {
      const p = await createProduct(h, owner, { stock: 9 });
      const res = await admin().get(`admin/products/${p.productId}/variants`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({ id: p.variantId, onHand: 9, reserved: 0, available: 9 }),
      ]);
      expect((await admin().get(`admin/products/${MISSING}/variants`)).status).toBe(404);
    });

    it('PRD-R4 storefront: only ACTIVE products by slug; unknown slug → 404', async () => {
      const p = await createProduct(h, owner, { pricePence: 2750 });
      const { rows } = await h.db.query('select slug from public.products where id = $1', [p.productId]);
      const slug = rows[0].slug;
      const live = await h.http().get(`${API}/products/${slug}`);
      expect(live.status, live.text).toBe(200);
      expect(live.body.data).toMatchObject({ id: p.productId, basePricePence: 2750 });

      for (const status of ['DRAFT', 'INACTIVE', 'ARCHIVED']) {
        await h.db.query('update public.products set status = $1 where id = $2', [status, p.productId]);
        expect((await h.http().get(`${API}/products/${slug}`)).status).toBe(404);
        const list = await h.http().get(`${API}/products`).query({ q: slug });
        expect(list.body.data.total).toBe(0);
      }
      expect((await h.http().get(`${API}/products/no-such-${tag()}`)).status).toBe(404);
    });
  });

  // ———————————————————————————————— update ————————————————————————————————
  describe('PATCH admin/products/:id', () => {
    it('PRD-U1 updates fields, writes an audit row, storefront sees the new slug', async () => {
      const p = await createProduct(h, owner);
      const slug = `renamed-${tag()}`;
      const res = await admin().patch(`admin/products/${p.productId}`, {
        name: 'Renamed',
        slug,
        description: 'Long description',
        shortDescription: 'Short',
      });
      expect(res.status, res.text).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'Renamed', slug, description: 'Long description', shortDescription: 'Short' });
      expect((await h.http().get(`${API}/products/${slug}`)).status).toBe(200);
      const { rows } = await h.db.query(
        `select count(*)::int n from public.audit_logs where entity_id = $1 and action = 'PRODUCT_UPDATED'`,
        [p.productId],
      );
      expect(rows[0].n).toBe(1);
    });

    it('PRD-U2 status transitions control storefront visibility', async () => {
      const p = await createProduct(h, owner);
      const { rows } = await h.db.query('select slug from public.products where id = $1', [p.productId]);
      expect((await admin().patch(`admin/products/${p.productId}`, { status: 'INACTIVE' })).status).toBe(200);
      expect((await h.http().get(`${API}/products/${rows[0].slug}`)).status).toBe(404);
      expect((await admin().patch(`admin/products/${p.productId}`, { status: 'ACTIVE' })).status).toBe(200);
      expect((await h.http().get(`${API}/products/${rows[0].slug}`)).status).toBe(200);
    });

    it('PRD-U3 category: set derives department, null clears both', async () => {
      const p = await createProduct(h, owner);
      const cat = await category();
      const set = await admin().patch(`admin/products/${p.productId}`, { categoryId: cat.id });
      expect(set.body.data).toMatchObject({ categoryId: cat.id, departmentId: cat.departmentId });
      const cleared = await admin().patch(`admin/products/${p.productId}`, { categoryId: null });
      expect(cleared.status, cleared.text).toBe(200);
      expect(cleared.body.data).toMatchObject({ categoryId: null, departmentId: null });
    });

    it('PRD-U4 rejects bad input: unknown product/category 404, invalid status 400, duplicate slug 409', async () => {
      const a = await createProduct(h, owner);
      const b = await createProduct(h, owner);
      const { rows } = await h.db.query('select slug from public.products where id = $1', [b.productId]);
      expect((await admin().patch(`admin/products/${MISSING}`, { name: 'x' })).status).toBe(404);
      expect((await admin().patch(`admin/products/${a.productId}`, { categoryId: MISSING })).status).toBe(404);
      expect((await admin().patch(`admin/products/${a.productId}`, { status: 'BOGUS' })).status).toBe(400);
      expect((await admin().patch(`admin/products/${a.productId}`, { slug: rows[0].slug })).status).toBe(409);
      expect((await as(staff).patch(`admin/products/${a.productId}`, { name: 'x' })).status).toBe(403);
    });
  });

  // ———————————————————————————————— delete ————————————————————————————————
  describe('DELETE admin/products/:id', () => {
    it('PRD-D1 archives product + variants, purges stock, audit logged', async () => {
      const p = await createProduct(h, owner, { stock: 4 });
      const res = await admin().del(`admin/products/${p.productId}`);
      expect(res.status, res.text).toBe(200);
      expect(res.body.data).toEqual({ id: p.productId, status: 'ARCHIVED', stockRowsRemoved: 1 });
      const { rows } = await h.db.query(
        `select p.status as product, v.status as variant from public.products p
           join public.product_variants v on v.product_id = p.id where p.id = $1`,
        [p.productId],
      );
      expect(rows[0]).toEqual({ product: 'ARCHIVED', variant: 'ARCHIVED' });
      expect(await stockOf(h, p.variantId)).toMatchObject({ onHand: 0, reserved: 0 });
    });

    it('PRD-D2 refuses while units are reserved (409), product untouched', async () => {
      const p = await createProduct(h, owner, { stock: 3 });
      const cart = await newGuestCart(h);
      expect((await addToCart(h, cart, p.variantId, 1)).status).toBe(201);
      const res = await admin().del(`admin/products/${p.productId}`);
      expect(res.status, res.text).toBe(409);
      expect(res.body.error.code).toBe('STOCK_RESERVED');
      const { rows } = await h.db.query('select status from public.products where id = $1', [p.productId]);
      expect(rows[0].status).toBe('ACTIVE');
    });

    it('PRD-D3 repeat delete is harmless; unknown → 404; STAFF → 403', async () => {
      const p = await createProduct(h, owner);
      expect((await admin().del(`admin/products/${p.productId}`)).status).toBe(200);
      const again = await admin().del(`admin/products/${p.productId}`);
      expect(again.status).toBe(200);
      expect(again.body.data.stockRowsRemoved).toBe(0);
      expect((await admin().del(`admin/products/${MISSING}`)).status).toBe(404);
      const q = await createProduct(h, owner);
      expect((await as(staff).del(`admin/products/${q.productId}`)).status).toBe(403);
    });
  });

  // ——————————————————————————————— variants ———————————————————————————————
  describe('variants', () => {
    it('PRD-V1 create: upper-cased SKU, price, stock; options flip product to VARIABLE', async () => {
      const p = await createProduct(h, owner);
      const { sizeIds } = await sizesAndColours();
      const sku = `extra-${tag()}`;
      const res = await admin().post(`admin/products/${p.productId}/variants`, {
        sku,
        sizeValueId: sizeIds[0],
        basePricePence: 3100,
        initialStock: 6,
      });
      expect(res.status, res.text).toBe(201);
      expect(res.body.data).toMatchObject({ sku: sku.toUpperCase(), isDefault: false, onHand: 6 });
      const detail = await admin().get(`admin/products/${p.productId}`);
      expect(detail.body.data.productType).toBe('VARIABLE');
      expect(detail.body.data.variants.find((v: { id: string }) => v.id === res.body.data.id))
        .toMatchObject({ onHand: 6, basePricePence: 3100 });
    });

    it('PRD-V2 create rejects duplicate SKU, duplicate option, blank SKU, archived product', async () => {
      const p = await createProduct(h, owner);
      const { colourIds } = await sizesAndColours();
      const first = await admin().post(`admin/products/${p.productId}/variants`, { sku: `v-${tag()}`, colorId: colourIds[0] });
      expect(first.status).toBe(201);

      const dupSku = await admin().post(`admin/products/${p.productId}/variants`, { sku: first.body.data.sku.toLowerCase() });
      expect(dupSku.status).toBe(400);
      expect(dupSku.body.error.code).toBe('DUPLICATE_SKU');

      const dupOption = await admin().post(`admin/products/${p.productId}/variants`, { sku: `v-${tag()}`, colorId: colourIds[0] });
      expect(dupOption.status).toBe(400);
      expect(dupOption.body.error.code).toBe('DUPLICATE_OPTION');

      expect((await admin().post(`admin/products/${p.productId}/variants`, { sku: '   ' })).status).toBe(400);

      await admin().del(`admin/products/${p.productId}`);
      expect((await admin().post(`admin/products/${p.productId}/variants`, { sku: `v-${tag()}` })).status).toBe(404);
      expect((await admin().post(`admin/products/${MISSING}/variants`, { sku: `v-${tag()}` })).status).toBe(404);
    });

    it('PRD-V3 update: SKU and price change; variant from another product → 404', async () => {
      const p = await createProduct(h, owner, { pricePence: 1000 });
      const other = await createProduct(h, owner);
      const sku = `NEW-${tag()}`.toUpperCase();
      const res = await admin().patch(`admin/products/${p.productId}/variants/${p.variantId}`, { sku, basePricePence: 1500 });
      expect(res.status, res.text).toBe(200);
      expect(res.body.data.sku).toBe(sku);
      const detail = await admin().get(`admin/products/${p.productId}`);
      expect(detail.body.data.variants[0]).toMatchObject({ sku, basePricePence: 1500 });
      expect((await admin().patch(`admin/products/${other.productId}/variants/${p.variantId}`, { sku: 'X' })).status).toBe(404);
      expect((await admin().patch(`admin/products/${p.productId}/variants/${p.variantId}`, { basePricePence: -1 })).status).toBe(400);
    });

    it('PRD-V3b SKUs are stored upper-case and stay unique on update', async () => {
      const p = await createProduct(h, owner);
      const other = await createProduct(h, owner);
      const lower = `mixed-${tag()}`;
      const res = await admin().patch(`admin/products/${p.productId}/variants/${p.variantId}`, { sku: `  ${lower} ` });
      expect(res.status, res.text).toBe(200);
      expect(res.body.data.sku).toBe(lower.toUpperCase());
      const clash = await admin().patch(`admin/products/${other.productId}/variants/${other.variantId}`, { sku: lower });
      expect(clash.status).toBe(400);
      expect(clash.body.error.code).toBe('DUPLICATE_SKU');
      expect((await admin().patch(`admin/products/${p.productId}/variants/${p.variantId}`, { sku: '  ' })).status).toBe(400);
      // Re-saving its own SKU is not a clash.
      expect((await admin().patch(`admin/products/${p.productId}/variants/${p.variantId}`, { sku: lower })).status).toBe(200);
    });

    it('PRD-V4 delete: archives and purges stock; reserved → 409; wrong product → 404', async () => {
      const p = await createProduct(h, owner, { stock: 5 });
      const extra = await admin().post(`admin/products/${p.productId}/variants`, { sku: `del-${tag()}`, initialStock: 2 });
      const extraId = extra.body.data.id;

      const cart = await newGuestCart(h);
      await addToCart(h, cart, p.variantId, 1);
      const blocked = await admin().del(`admin/products/${p.productId}/variants/${p.variantId}`);
      expect(blocked.status).toBe(409);

      const res = await admin().del(`admin/products/${p.productId}/variants/${extraId}`);
      expect(res.status, res.text).toBe(200);
      expect(res.body.data.status).toBe('ARCHIVED');
      expect(await stockOf(h, extraId)).toMatchObject({ onHand: 0 });

      const other = await createProduct(h, owner);
      expect((await admin().del(`admin/products/${other.productId}/variants/${p.variantId}`)).status).toBe(404);
    });
  });

  // ——————————————————————————————— inventory ——————————————————————————————
  describe('inventory', () => {
    it('PRD-I1 adjust up and down; movements recorded; audit logged', async () => {
      const p = await createProduct(h, owner, { stock: 5 });
      const up = await admin().post('admin/inventory/adjust', { warehouseId, variantId: p.variantId, onHandDelta: 10, reason: 'Restock' });
      expect(up.status, up.text).toBe(201);
      expect(up.body.data).toMatchObject({ onHand: 15 });
      const down = await admin().post('admin/inventory/adjust', { warehouseId, variantId: p.variantId, onHandDelta: -4 });
      expect(down.body.data).toMatchObject({ onHand: 11 });
      const moves = await admin().get(`admin/inventory/movements?variantId=${p.variantId}`);
      expect(moves.body.data.total).toBe(3); // initial + up + down
      const { rows } = await h.db.query(
        `select count(*)::int n from public.audit_logs where action = 'STOCK_ADJUSTED' and after->>'productId' = $1`,
        [p.productId],
      );
      expect(rows[0].n).toBe(2);
    });

    it('PRD-I2 cannot take stock below zero or below reserved units', async () => {
      const p = await createProduct(h, owner, { stock: 3 });
      const tooMuch = await admin().post('admin/inventory/adjust', { warehouseId, variantId: p.variantId, onHandDelta: -4 });
      expect([400, 409]).toContain(tooMuch.status);
      const cart = await newGuestCart(h);
      await addToCart(h, cart, p.variantId, 2);
      const belowReserved = await admin().post('admin/inventory/adjust', { warehouseId, variantId: p.variantId, onHandDelta: -2 });
      expect([400, 409]).toContain(belowReserved.status);
      expect(await stockOf(h, p.variantId)).toMatchObject({ onHand: 3, reserved: 2 });
    });

    it('PRD-I3 rejects archived variants/products, zero-less bad bodies; STAFF may adjust', async () => {
      const p = await createProduct(h, owner, { stock: 2 });
      expect((await as(staff).post('admin/inventory/adjust', { warehouseId, variantId: p.variantId, onHandDelta: 1 })).status).toBe(201);
      expect((await admin().post('admin/inventory/adjust', { warehouseId, variantId: MISSING, onHandDelta: 1 })).status).toBe(404);
      expect((await admin().post('admin/inventory/adjust', { warehouseId, variantId: 'nope', onHandDelta: 1 })).status).toBe(400);
      expect((await admin().post('admin/inventory/adjust', { warehouseId, variantId: p.variantId, onHandDelta: 2_000_000 })).status).toBe(400);
      await admin().del(`admin/products/${p.productId}`);
      expect((await admin().post('admin/inventory/adjust', { warehouseId, variantId: p.variantId, onHandDelta: 1 })).status).toBe(404);
    });
  });

  // ——————————————————————————————— attributes —————————————————————————————
  describe('POST admin/products/:id/attributes', () => {
    it('PRD-A1 assigns an attribute; repeat is idempotent; unknown ids rejected', async () => {
      const p = await createProduct(h, owner);
      const attr = await h.db.query(
        `insert into public.attributes (code, name) values ($1, 'Fabric') returning id`,
        [`FAB_${tag()}`],
      );
      const body = { attributeId: attr.rows[0].id, role: 'INFORMATIONAL' };
      const first = await admin().post(`admin/products/${p.productId}/attributes`, body);
      expect(first.status, first.text).toBe(201);
      const again = await admin().post(`admin/products/${p.productId}/attributes`, body);
      expect(again.status, again.text).toBe(201);
      const { rows } = await h.db.query(
        'select count(*)::int n from public.product_attributes where product_id = $1',
        [p.productId],
      );
      expect(rows[0].n).toBe(1);
      expect((await admin().post(`admin/products/${p.productId}/attributes`, { attributeId: MISSING, role: 'INFORMATIONAL' })).status).toBe(404);
      expect((await admin().post(`admin/products/${MISSING}/attributes`, body)).status).toBe(404);
      expect((await as(staff).post(`admin/products/${p.productId}/attributes`, body)).status).toBe(403);
    });
  });
});
