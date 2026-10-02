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

  describe('category delete', () => {
    async function category(parentId: string | null = null) {
      const t = Math.random().toString(36).slice(2, 8);
      const dept = await h.db.query(
        `insert into public.departments (name, slug) values ($1, $1) returning id`,
        [`dept-${t}`],
      );
      const cat = await h.db.query(
        `insert into public.categories (department_id, parent_id, name, slug)
         values ($1, $2, $3, $3) returning id`,
        [dept.rows[0].id, parentId, `cat-${t}`],
      );
      return cat.rows[0].id as string;
    }
    const del = (id: string) =>
      h.http().delete(`${API}/admin/categories/${id}`).set(bearer(owner));
    const exists = async (id: string) =>
      (await h.db.query('select 1 from public.categories where id = $1', [id]))
        .rowCount === 1;

    it('CAT deletes an unused category', async () => {
      const id = await category();
      const res = await del(id);
      expect(res.status, res.text).toBe(200);
      expect(await exists(id)).toBe(false);
    });

    it('CAT refuses while subcategories exist, naming them', async () => {
      const parent = await category();
      const child = await category(parent);
      const { rows } = await h.db.query(
        'select name from public.categories where id = $1',
        [child],
      );
      const res = await del(parent);
      expect(res.status, res.text).toBe(409);
      expect(res.body.error.code).toBe('CATEGORY_HAS_SUBCATEGORIES');
      expect(res.body.error.message).toContain(rows[0].name);
      expect(await exists(parent)).toBe(true);
    });

    it('CAT refuses while live products use it (category or subcategory)', async () => {
      for (const column of ['category_id', 'subcategory_id']) {
        const id = await category();
        const p = await createProduct(h, owner);
        await h.db.query(
          `update public.products set ${column} = $1 where id = $2`,
          [id, p.productId],
        );
        const res = await del(id);
        expect(res.status, res.text).toBe(409);
        expect(res.body.error.code).toBe('CATEGORY_IN_USE');
        expect(await exists(id)).toBe(true);
      }
    });

    it('CAT unlinks archived products and deletes', async () => {
      const id = await category();
      const p = await createProduct(h, owner);
      await h.db.query(
        `update public.products set category_id = $1, subcategory_id = $1, status = 'ARCHIVED' where id = $2`,
        [id, p.productId],
      );
      const res = await del(id);
      expect(res.status, res.text).toBe(200);
      expect(await exists(id)).toBe(false);
      const { rows } = await h.db.query(
        'select category_id, subcategory_id from public.products where id = $1',
        [p.productId],
      );
      expect(rows[0]).toEqual({ category_id: null, subcategory_id: null });
    });

    it('CAT unknown id → 404, malformed id → 400', async () => {
      expect((await del('00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await del('not-a-uuid')).status).toBe(400);
    });
  });

  describe('colour & size delete', () => {
    const t = () => Math.random().toString(36).slice(2, 8);
    async function colour() {
      const n = `col-${t()}`;
      const r = await h.db.query(
        `insert into public.colors (name, name_normalized) values ($1, $1) returning id`,
        [n],
      );
      return r.rows[0].id as string;
    }
    async function size() {
      const sys = await h.db.query(
        `insert into public.size_systems (code, name) values ($1, 'QA') returning id`,
        [`SYS_${t()}`],
      );
      const r = await h.db.query(
        `insert into public.size_system_values (size_system_id, code, label) values ($1, 'M', 'M') returning id`,
        [sys.rows[0].id],
      );
      return r.rows[0].id as string;
    }
    async function attach(column: 'color_id' | 'size_value_id', id: string) {
      const p = await createProduct(h, owner);
      const attr = await h.db.query(
        `insert into public.attributes (code, name) values ($1, 'Opt') returning id`,
        [`A_${t()}`],
      );
      await h.db.query(
        `insert into public.product_variant_options (variant_id, attribute_id, ${column}) values ($1, $2, $3)`,
        [p.variantId, attr.rows[0].id, id],
      );
      return p;
    }

    for (const [label, path, column, make, table, code] of [
      ['colour', 'colors', 'color_id', colour, 'colors', 'COLOR_IN_USE'],
      ['size', 'sizes', 'size_value_id', size, 'size_system_values', 'SIZE_IN_USE'],
    ] as const) {
      const del = (id: string) =>
        h.http().delete(`${API}/admin/${path}/${id}`).set(bearer(owner));
      const exists = async (id: string) =>
        (await h.db.query(`select 1 from public.${table} where id = $1`, [id]))
          .rowCount === 1;

      it(`OPT ${label}: unused → deleted`, async () => {
        const id = await make();
        expect((await del(id)).status).toBe(200);
        expect(await exists(id)).toBe(false);
      });

      it(`OPT ${label}: used by a live product → 409`, async () => {
        const id = await make();
        await attach(column, id);
        const res = await del(id);
        expect(res.status, res.text).toBe(409);
        expect(res.body.error.code).toBe(code);
        expect(await exists(id)).toBe(true);
      });

      it(`OPT ${label}: only archived products → deleted`, async () => {
        const id = await make();
        const p = await attach(column, id);
        await h.db.query(
          `update public.products set status = 'ARCHIVED' where id = $1`,
          [p.productId],
        );
        expect((await del(id)).status).toBe(200);
        expect(await exists(id)).toBe(false);
      });

      it(`OPT ${label}: unknown → 404, malformed → 400`, async () => {
        expect((await del('00000000-0000-4000-8000-000000000000')).status).toBe(404);
        expect((await del('nope')).status).toBe(400);
      });
    }
  });
});
