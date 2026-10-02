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
  shippingMethod,
  type Harness,
  type TestUser,
} from './harness.js';

/**
 * Pins the results of the heavier list/aggregate queries (storefront product
 * filters, payment queue, dashboard, storefront filters) so query rewrites
 * can't silently change what they return.
 */
describe('List & aggregate query results', () => {
  let h: Harness;
  let owner: TestUser;

  beforeAll(async () => {
    h = await createHarness();
    owner = await createAdmin(h, 'OWNER');
  });
  afterAll(() => h.close());

  const tag = () => randomUUID().slice(0, 8);

  /** Public product search scoped to one product via its unique slug. */
  async function search(slugOf: string, filters: Record<string, string>) {
    const res = await h
      .http()
      .get(`${API}/products`)
      .query({ q: slugOf, ...filters });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data as {
      items: Array<{ id: string; inStock: boolean; basePricePence: number }>;
      total: number;
    };
  }

  async function slugOf(productId: string) {
    const { rows } = await h.db.query(
      'select slug from public.products where id = $1',
      [productId],
    );
    return rows[0].slug as string;
  }

  describe('storefront product filters', () => {
    let attributeId: string;
    let optionId: string;
    let otherOptionId: string;
    let colorId: string;
    let otherColorId: string;
    let sizeValueId: string;
    let collectionId: string;
    let otherCollectionId: string;
    let product: Awaited<ReturnType<typeof createProduct>>;
    let slug: string;

    beforeAll(async () => {
      const t = tag();
      const attr = await h.db.query(
        `insert into public.attributes (code, name) values ($1, 'Fit') returning id`,
        [`FIT_${t}`],
      );
      attributeId = attr.rows[0].id;
      const colorAttr = await h.db.query(
        `insert into public.attributes (code, name, input_type) values ($1, 'Colour', 'COLOR') returning id`,
        [`COL_${t}`],
      );
      const sizeAttr = await h.db.query(
        `insert into public.attributes (code, name, input_type) values ($1, 'Size', 'SIZE') returning id`,
        [`SIZ_${t}`],
      );
      const opts = await h.db.query(
        `insert into public.attribute_options (attribute_id, value, label, sort_order)
         values ($1, 'slim', 'Slim', 2), ($1, 'loose', 'Loose', 1) returning id`,
        [attributeId],
      );
      [optionId, otherOptionId] = opts.rows.map((r) => r.id);
      const cols = await h.db.query(
        `insert into public.colors (name, name_normalized) values ($1, $1), ($2, $2) returning id`,
        [`red-${t}`, `blue-${t}`],
      );
      [colorId, otherColorId] = cols.rows.map((r) => r.id);
      const system = await h.db.query(
        `insert into public.size_systems (code, name) values ($1, 'QA') returning id`,
        [`QA_${t}`],
      );
      const size = await h.db.query(
        `insert into public.size_system_values (size_system_id, code, label) values ($1, 'M', 'M') returning id`,
        [system.rows[0].id],
      );
      sizeValueId = size.rows[0].id;
      const colls = await h.db.query(
        `insert into public.collections (name, slug) values ('A', $1), ('B', $2) returning id`,
        [`coll-a-${t}`, `coll-b-${t}`],
      );
      [collectionId, otherCollectionId] = colls.rows.map((r) => r.id);

      product = await createProduct(h, owner, { pricePence: 3000, stock: 4 });
      slug = await slugOf(product.productId);
      await h.db.query(
        `insert into public.product_variant_options (variant_id, attribute_id, option_id) values ($1, $2, $3)`,
        [product.variantId, attributeId, optionId],
      );
      await h.db.query(
        `insert into public.product_variant_options (variant_id, attribute_id, color_id) values ($1, $2, $3)`,
        [product.variantId, colorAttr.rows[0].id, colorId],
      );
      await h.db.query(
        `insert into public.product_variant_options (variant_id, attribute_id, size_value_id) values ($1, $2, $3)`,
        [product.variantId, sizeAttr.rows[0].id, sizeValueId],
      );
      await h.db.query(
        `insert into public.product_collections (product_id, collection_id) values ($1, $2)`,
        [product.productId, collectionId],
      );
    });

    it.each([
      ['no filters', {}, 1],
      ['matching option', () => ({ attributeOptionId: optionId }), 1],
      ['other option', () => ({ attributeOptionId: otherOptionId }), 0],
      ['matching colour', () => ({ colorId }), 1],
      ['other colour', () => ({ colorId: otherColorId }), 0],
      ['matching size', () => ({ sizeValueId }), 1],
      ['matching collection', () => ({ collectionId }), 1],
      ['other collection', () => ({ collectionId: otherCollectionId }), 0],
      ['price inside range', { minPricePence: '2000', maxPricePence: '3000' }, 1],
      ['price below min', { minPricePence: '3001' }, 0],
      ['price above max', { maxPricePence: '2999' }, 0],
      ['in stock', { inStock: 'true' }, 1],
      [
        'combined filters',
        () => ({ colorId, collectionId, inStock: 'true', maxPricePence: '5000' }),
        1,
      ],
      [
        'combined filters, one miss',
        () => ({ colorId, collectionId: otherCollectionId }),
        0,
      ],
    ] as const)('FLT %s', async (_name, filters, expected) => {
      const params = typeof filters === 'function' ? filters() : filters;
      const result = await search(slug, params as Record<string, string>);
      expect(result.total).toBe(expected);
      expect(result.items).toHaveLength(expected);
      if (expected) expect(result.items[0].id).toBe(product.productId);
    });

    it('FLT inStock excludes fully reserved and archived-variant products', async () => {
      const reserved = await createProduct(h, owner, { stock: 1 });
      const reservedSlug = await slugOf(reserved.productId);
      const cart = await newGuestCart(h);
      expect((await addToCart(h, cart, reserved.variantId, 1)).status).toBe(201);
      expect((await search(reservedSlug, { inStock: 'true' })).total).toBe(0);
      expect((await search(reservedSlug, {})).items[0].inStock).toBe(false);

      const archived = await createProduct(h, owner, { stock: 5 });
      const archivedSlug = await slugOf(archived.productId);
      await h.db.query(
        `update public.product_variants set status = 'ARCHIVED' where id = $1`,
        [archived.variantId],
      );
      expect((await search(archivedSlug, { inStock: 'true' })).total).toBe(0);
    });

    it('FLT search treats % and _ literally', async () => {
      expect((await search('%', {})).total).toBe(0);
      expect((await search('QA_Product', {})).total).toBe(0);
      expect((await search(slug, {})).total).toBe(1);
    });

    it('FLT inactive products never appear on the storefront', async () => {
      const p = await createProduct(h, owner);
      const s = await slugOf(p.productId);
      await h.db.query(
        `update public.products set status = 'DRAFT' where id = $1`,
        [p.productId],
      );
      expect((await search(s, {})).total).toBe(0);
    });

    it('FLT pagination returns totals independent of page size', async () => {
      const res = await h
        .http()
        .get(`${API}/products`)
        .query({ q: 'QA Product', pageSize: 1, page: 2 });
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.total).toBeGreaterThan(1);
      expect(res.body.data.totalPages).toBe(res.body.data.total);
    });
  });

  describe('payment queue', () => {
    it('QUE proofs are grouped per payment, newest first, with counts', async () => {
      const standardId = (await shippingMethod(h)).id;
      const customer = await createAuthUser(h, 'queue');

      async function placeOrder() {
        const p = await createProduct(h, owner, { stock: 5, pricePence: 1000 });
        const cart = await newGuestCart(h);
        await addToCart(h, cart, p.variantId, 1);
        const res = await h
          .http()
          .post(`${API}/checkout/authenticated`)
          .set(bearer(customer))
          .set('X-Guest-Token', cart.guestToken)
          .send(checkoutBody(cart.cartId, standardId, customer.email));
        expect(res.status).toBe(201);
        const { rows } = await h.db.query(
          `select p.id from public.payments p join public.orders o on o.id = p.order_id
           where o.order_number = $1`,
          [res.body.data.orderNumber],
        );
        return {
          orderNumber: res.body.data.orderNumber as string,
          paymentId: rows[0].id as string,
        };
      }

      const a = await placeOrder();
      const b = await placeOrder();
      const insertProof = (paymentId: string, ref: string, at: string) =>
        h.db.query(
          `insert into public.payment_proofs
             (payment_id, storage_path, mime, size_bytes, customer_reference, uploaded_at)
           values ($1, $2, 'image/png', 10, $3, $4)`,
          [paymentId, `proofs/${randomUUID()}.png`, ref, at],
        );
      await insertProof(a.paymentId, 'a-old', '2026-01-01T10:00:00Z');
      await insertProof(a.paymentId, 'a-new', '2026-01-02T10:00:00Z');
      await insertProof(b.paymentId, 'b-only', '2026-01-01T12:00:00Z');

      for (const [o, refs] of [
        [a, ['a-new', 'a-old']],
        [b, ['b-only']],
      ] as const) {
        const res = await h
          .http()
          .get(`${API}/admin/payments/queue`)
          .set(bearer(owner))
          .query({ status: 'all', q: o.orderNumber });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.data.total).toBe(1);
        const item = res.body.data.items[0];
        expect(item.id).toBe(o.paymentId);
        expect(item.proofCount).toBe(refs.length);
        expect(
          item.proofs.map((p: { customerReference: string }) => p.customerReference),
        ).toEqual(refs);
        expect(item.customerReference).toBe(refs[0]);
      }

      const withProof = await h
        .http()
        .get(`${API}/admin/payments/queue`)
        .set(bearer(owner))
        .query({ status: 'all', hasProof: 'true', pageSize: 100 });
      const ids = withProof.body.data.items.map((i: { id: string }) => i.id);
      expect(ids).toEqual(expect.arrayContaining([a.paymentId, b.paymentId]));
    });
  });

  describe('dashboard & storefront filter aggregates', () => {
    it('AGG dashboard stats match independent SQL', async () => {
      const res = await h
        .http()
        .get(`${API}/admin/dashboard`)
        .set(bearer(owner));
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      const setting = await h.db.query(
        `select value->>'lowStockThreshold' as t from public.platform_settings where key = 'inventory'`,
      );
      const threshold = Number(setting.rows[0]?.t ?? 5);
      const { rows } = await h.db.query(
        `select
           (select count(*)::int from public.inventory_items i
              join public.product_variants v on v.id = i.variant_id
             where v.status <> 'ARCHIVED' and i.on_hand - i.reserved <= $1) as low,
           (select coalesce(sum(grand_total_pence), 0)::bigint from public.orders
             where payment_status = 'VERIFIED'
               and placed_at >= (date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London')) as revenue`,
        [threshold],
      );
      expect(res.body.data.lowStockVariants).toBe(rows[0].low);
      expect(res.body.data.revenueTodayPence).toBe(Number(rows[0].revenue));
      expect(typeof res.body.data.ordersToday).toBe('number');
    });

    it('AGG storefront price range ignores draft products', async () => {
      const draft = await createProduct(h, owner, { pricePence: 999_999 });
      await h.db.query(
        `update public.products set status = 'DRAFT' where id = $1`,
        [draft.productId],
      );
      const res = await h.http().get(`${API}/catalog/filters`);
      expect(res.body.data.priceRange.maxPence).toBeLessThan(999_999);
    });

    it('AGG storefront filters: price range and attribute options', async () => {
      const t = tag();
      const attr = await h.db.query(
        `insert into public.attributes (code, name) values ($1, 'Material') returning id`,
        [`MAT_${t}`],
      );
      await h.db.query(
        `insert into public.attribute_options (attribute_id, value, label, sort_order)
         values ($1, 'wool', 'Wool', 2), ($1, 'silk', 'Silk', 1)`,
        [attr.rows[0].id],
      );

      const res = await h.http().get(`${API}/catalog/filters`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      const { rows } = await h.db.query(
        `select min(coalesce(pp.sale_price_pence, pp.base_price_pence))::bigint as min,
                max(coalesce(pp.sale_price_pence, pp.base_price_pence))::bigint as max
           from public.product_prices pp
           join public.products p on p.id = pp.product_id
          where p.status = 'ACTIVE'`,
      );
      expect(res.body.data.priceRange).toEqual({
        minPence: Number(rows[0].min),
        maxPence: Number(rows[0].max),
      });

      const material = res.body.data.attributes.find(
        (a: { id: string }) => a.id === attr.rows[0].id,
      );
      expect(material.options.map((o: { label: string }) => o.label)).toEqual([
        'Silk',
        'Wool',
      ]);
      for (const a of res.body.data.attributes) {
        expect(Array.isArray(a.options)).toBe(true);
      }
    });
  });
});
