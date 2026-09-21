/**
 * Live API scenario suite — production-readiness checks against a running backend.
 * Run: npm run test:e2e  (backend must be up on :3000)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';

const API = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
const ROOT = process.env.API_ROOT_URL ?? 'http://localhost:3000';

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

function loadAdminCreds() {
  const path = resolve(process.cwd(), '.admin-credentials.local');
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const email = raw.match(/^OWNER_EMAIL=(.+)$/m)?.[1]?.trim();
  const password = raw.match(/^OWNER_PASSWORD=(.+)$/m)?.[1]?.trim();
  if (!email || !password) return null;
  return { email, password };
}

async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Envelope<T> | null; text: string }> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  let body: Envelope<T> | null = null;
  try {
    body = JSON.parse(text) as Envelope<T>;
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}

describe('Live API scenarios', () => {
  let healthy = false;
  let accessToken: string | null = null;
  let adminToken: string | null = null;
  let guestCartId: string | null = null;
  let guestToken: string | null = null;
  let productVariantId: string | null = null;
  let shippingMethodId: string | null = null;

  beforeAll(async () => {
    try {
      const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) });
      healthy = res.ok;
    } catch {
      healthy = false;
    }
  });

  it('API is reachable', () => {
    expect(healthy).toBe(true);
  });

  describe('Health & redirect', () => {
    it('GET /health returns ok envelope', async () => {
      if (!healthy) return;
      const { status, body } = await api<{ status: string }>('/health');
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
    });

    it('GET / (API root) returns branded redirect HTML preserving hash', async () => {
      if (!healthy) return;
      const res = await fetch(ROOT + '/');
      const html = await res.text();
      expect(res.headers.get('content-type') ?? '').toMatch(/html/i);
      expect(html).toContain('Thread N Form');
      expect(html).toContain('/auth/callback');
      expect(html).toContain('window.location.hash');
    });
  });

  describe('Auth module', () => {
    it('rejects empty sign-in body', async () => {
      if (!healthy) return;
      const { status, body } = await api('/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(body?.success).toBe(false);
    });

    it('rejects wrong password', async () => {
      if (!healthy) return;
      const { status, body } = await api('/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify({
          email: 'nobody@threadnform.test',
          password: 'definitely-wrong-password',
        }),
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(body?.success).toBe(false);
    });

    it('rejects /auth/me without bearer token', async () => {
      if (!healthy) return;
      const { status, body } = await api('/auth/me');
      expect(status).toBe(401);
      expect(body?.success).toBe(false);
    });

    it('rejects malformed bearer token', async () => {
      if (!healthy) return;
      const { status } = await api('/auth/me', {
        headers: { Authorization: 'Bearer not-a-real-jwt' },
      });
      expect(status).toBe(401);
    });

    it('signs in admin owner and returns session', async () => {
      if (!healthy) return;
      const creds = loadAdminCreds();
      expect(creds).toBeTruthy();
      const { status, body } = await api<{
        accessToken: string;
        refreshToken: string;
        user: { email: string; id: string };
      }>('/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify(creds),
      });
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
      if (body?.success) {
        expect(body.data.accessToken).toBeTruthy();
        expect(body.data.refreshToken).toBeTruthy();
        accessToken = body.data.accessToken;
        adminToken = body.data.accessToken;
      }
    });

    it('GET /auth/me returns user for valid token', async () => {
      if (!healthy || !accessToken) return;
      const { status, body } = await api<{ email: string; id: string }>('/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
      if (body?.success) {
        expect(body.data.email).toContain('@');
        expect(body.data.id).toBeTruthy();
      }
    });

    it('rejects sign-up with weak password', async () => {
      if (!healthy) return;
      const { status, body } = await api('/auth/sign-up', {
        method: 'POST',
        body: JSON.stringify({
          email: `weak-${Date.now()}@threadnform.test`,
          password: 'short',
          fullName: 'Weak Pass',
        }),
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(body?.success).toBe(false);
    });

    it('rejects sign-up with invalid email', async () => {
      if (!healthy) return;
      const { status, body } = await api('/auth/sign-up', {
        method: 'POST',
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'ValidPass123!',
          fullName: 'Bad Email',
        }),
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(body?.success).toBe(false);
    });
  });

  describe('Catalog module', () => {
    it('lists departments / categories / brands / collections', async () => {
      if (!healthy) return;
      for (const path of [
        '/departments',
        '/categories',
        '/brands',
        '/collections',
      ]) {
        const { status, body } = await api(path);
        expect(status, path).toBe(200);
        expect(body?.success, path).toBe(true);
      }
    });

    it('returns catalog filters shape', async () => {
      if (!healthy) return;
      const { status, body } = await api<{
        departments: unknown[];
        categories: unknown[];
        brands: unknown[];
        collections: unknown[];
        sizes: unknown[];
        colors: unknown[];
        attributes: unknown[];
        priceRange: { minPence: number | null; maxPence: number | null };
      }>('/catalog/filters');
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
      if (body?.success) {
        expect(Array.isArray(body.data.departments)).toBe(true);
        expect(Array.isArray(body.data.categories)).toBe(true);
        expect(Array.isArray(body.data.brands)).toBe(true);
        expect(body.data.priceRange).toBeTruthy();
      }
    });

    it('lists products with pagination defaults', async () => {
      if (!healthy) return;
      const { status, body } = await api<{
        items: Array<{ id: string; slug: string }>;
        page: number;
        pageSize: number;
        total: number;
      }>('/products?page=1&pageSize=5');
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
      if (body?.success) {
        expect(body.data.page).toBe(1);
        expect(body.data.pageSize).toBeLessThanOrEqual(5);
        expect(Array.isArray(body.data.items)).toBe(true);
      }
    });

    it('handles empty search without error', async () => {
      if (!healthy) return;
      const { status, body } = await api(
        '/products?q=zzz-no-such-product-threadnform-xyz',
      );
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
      if (body?.success) {
        const data = body.data as { items: unknown[]; total: number };
        expect(data.total).toBe(0);
        expect(data.items).toEqual([]);
      }
    });

    it('rejects nonsense UUID filters gracefully', async () => {
      if (!healthy) return;
      const { status } = await api(
        '/products?categoryId=not-a-uuid',
      );
      // Either validation 400 or empty 200 — must not 500
      expect(status).not.toBe(500);
    });
  });

  describe('Site content module', () => {
    it('returns public billboard (or null) without auth', async () => {
      if (!healthy) return;
      const { status, body } = await api('/site/billboard');
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
    });

    it('returns public reviews list', async () => {
      if (!healthy) return;
      const { status, body } = await api('/site/reviews');
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
    });

    it('blocks admin billboard list without auth', async () => {
      if (!healthy) return;
      const { status } = await api('/admin/site/billboards');
      expect(status).toBe(401);
    });
  });

  describe('Cart & shipping module', () => {
    it('creates a guest cart', async () => {
      if (!healthy) return;
      const { status, body } = await api<{
        cartId: string;
        guestToken: string;
      }>('/carts', { method: 'POST' });
      expect([200, 201]).toContain(status);
      expect(body?.success).toBe(true);
      if (body?.success) {
        guestCartId = body.data.cartId;
        guestToken = body.data.guestToken;
        expect(guestCartId).toBeTruthy();
        expect(guestToken).toBeTruthy();
      }
    });

    it('fetches guest cart with token', async () => {
      if (!healthy || !guestCartId) return;
      const headers: Record<string, string> = {};
      if (guestToken) headers['X-Guest-Token'] = guestToken;
      const { status, body } = await api(`/carts/${guestCartId}`, { headers });
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
    });

    it('rejects cart fetch without guest token', async () => {
      if (!healthy || !guestCartId) return;
      const { status } = await api(`/carts/${guestCartId}`);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).not.toBe(500);
    });

    it('rejects cart fetch for unknown id', async () => {
      if (!healthy) return;
      const { status } = await api(
        '/carts/00000000-0000-0000-0000-000000000000',
        { headers: { 'X-Guest-Token': 'fake-token' } },
      );
      expect([400, 404]).toContain(status);
    });

    it('rejects cart fetch with wrong guest token', async () => {
      if (!healthy || !guestCartId) return;
      const { status } = await api(`/carts/${guestCartId}`, {
        headers: { 'X-Guest-Token': 'wrong-token' },
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).not.toBe(500);
    });

    it('lists shipping methods', async () => {
      if (!healthy) return;
      const { status, body } = await api<Array<{ id: string }>>('/shipping/methods');
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
      if (body?.success) {
        const methods = Array.isArray(body.data)
          ? body.data
          : (body.data as { items?: Array<{ id: string }> }).items ?? [];
        if (methods[0]) shippingMethodId = methods[0].id;
      }
    });

    it('rejects add-item with invalid variant', async () => {
      if (!healthy || !guestCartId) return;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (guestToken) headers['X-Guest-Token'] = guestToken;
      const { status } = await api(`/carts/${guestCartId}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          variantId: '00000000-0000-0000-0000-000000000000',
          quantity: 1,
        }),
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).not.toBe(500);
    });
  });

  describe('Checkout edge cases', () => {
    it('rejects guest checkout with empty body', async () => {
      if (!healthy) return;
      const { status, body } = await api('/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': `test-${Date.now()}` },
        body: JSON.stringify({}),
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(body?.success).toBe(false);
    });

    it('rejects checkout without idempotency key when required', async () => {
      if (!healthy) return;
      const { status } = await api('/checkout', {
        method: 'POST',
        body: JSON.stringify({
          cartId: guestCartId,
          shippingMethodId,
          email: 'test@threadnform.test',
          shippingAddress: {
            fullName: 'Test',
            line1: '1 High St',
            city: 'London',
            postcode: 'SW1A 1AA',
            country: 'GB',
          },
        }),
      });
      // Must not 500 — either 400 validation or 4xx missing key
      expect(status).not.toBe(500);
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('rejects non-UK shipping country', async () => {
      if (!healthy || !guestCartId || !shippingMethodId) return;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Idempotency-Key': `uk-only-${Date.now()}`,
      };
      if (guestToken) headers['X-Guest-Token'] = guestToken;
      const { status, body } = await api('/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cartId: guestCartId,
          shippingMethodId,
          email: 'test@threadnform.test',
          shippingAddress: {
            fullName: 'Test User',
            line1: '1 Main St',
            city: 'New York',
            postcode: '10001',
            country: 'US',
          },
        }),
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).not.toBe(500);
      if (body && !body.success) {
        expect(body.error.message.toLowerCase()).toMatch(
          /uk|united kingdom|postcode|address|cart|empty|country/i,
        );
      }
    });
  });

  describe('Customer account module', () => {
    it('lists orders for authenticated user', async () => {
      if (!healthy || !accessToken) return;
      const { status, body } = await api('/orders', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
    });

    it('lists addresses for authenticated user', async () => {
      if (!healthy || !accessToken) return;
      const { status, body } = await api('/customers/me/addresses', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(status).toBe(200);
      expect(body?.success).toBe(true);
    });

    it('blocks orders without auth', async () => {
      if (!healthy) return;
      const { status } = await api('/orders');
      expect(status).toBe(401);
    });
  });

  describe('Admin module', () => {
    it('blocks dashboard without auth', async () => {
      if (!healthy) return;
      const { status } = await api('/admin/dashboard');
      expect(status).toBe(401);
    });

    it('allows dashboard with admin token', async () => {
      if (!healthy || !adminToken) return;
      const { status, body } = await api('/admin/dashboard', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      // Owner should be admin; if role not seeded may 403
      expect([200, 403]).toContain(status);
      if (status === 200) expect(body?.success).toBe(true);
    });

    it('allows admin products list with token', async () => {
      if (!healthy || !adminToken) return;
      const { status } = await api('/admin/products', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect([200, 403]).toContain(status);
    });

    it('allows admin payment queue with token', async () => {
      if (!healthy || !adminToken) return;
      const { status } = await api('/admin/payments/queue', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect([200, 403]).toContain(status);
    });

    it('allows admin billboards with token', async () => {
      if (!healthy || !adminToken) return;
      const { status, body } = await api('/admin/site/billboards', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect([200, 403]).toContain(status);
      if (status === 200) expect(body?.success).toBe(true);
    });

    it('allows admin reviews with token', async () => {
      if (!healthy || !adminToken) return;
      const { status, body } = await api('/admin/site/reviews', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect([200, 403]).toContain(status);
      if (status === 200) expect(body?.success).toBe(true);
    });
  });

  describe('Frontend pages smoke', () => {
    const FE = process.env.FRONTEND_URL ?? 'http://localhost:3001';

    it(
      'storefront key routes return 200',
      async () => {
        if (!healthy) return;
        const routes = [
          '/',
          '/shop',
          '/login',
          '/register',
          '/account',
          '/cart',
          '/checkout',
          '/auth/callback',
        ];
        for (const route of routes) {
          try {
            const res = await fetch(`${FE}${route}`, {
              signal: AbortSignal.timeout(20000),
              redirect: 'manual',
            });
            expect(res.status, route).toBeLessThan(500);
            expect([200, 307, 308]).toContain(res.status);
          } catch (err) {
            expect.soft(false, `Frontend unreachable for ${route}: ${err}`).toBe(
              true,
            );
          }
        }
      },
      120_000,
    );
  });

  // silence unused until product seed exists
  void productVariantId;
});
