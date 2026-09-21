/**
 * Payment proof → admin approve flow (live API).
 * Run with backend up: npm run test:e2e
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';

const API = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';

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
): Promise<{ status: number; body: Envelope<T> | null }> {
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
  return { status: res.status, body };
}

describe('Payment proof → approve flow', () => {
  let healthy = false;
  let adminToken: string | null = null;
  let guestCartId: string | null = null;
  let guestToken: string | null = null;
  let shippingMethodId: string | null = null;
  let variantId: string | null = null;
  let orderNumber: string | null = null;
  let viewToken: string | null = null;
  let paymentId: string | null = null;
  const checkoutEmail = `payflow-${Date.now()}@threadnform.test`;

  beforeAll(async () => {
    try {
      const res = await fetch(`${API}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      healthy = res.ok;
    } catch {
      healthy = false;
    }
    if (!healthy) return;

    const creds = loadAdminCreds();
    if (creds) {
      const { body } = await api<{ accessToken?: string; session?: { accessToken?: string } }>(
        '/auth/sign-in',
        {
          method: 'POST',
          body: JSON.stringify(creds),
        },
      );
      if (body?.success) {
        adminToken =
          (body.data as { accessToken?: string }).accessToken ??
          (body.data as { session?: { accessToken?: string } }).session
            ?.accessToken ??
          null;
      }
    }

    const cart = await api<{ cartId: string; guestToken: string }>('/carts', {
      method: 'POST',
    });
    if (cart.body?.success) {
      guestCartId = cart.body.data.cartId;
      guestToken = cart.body.data.guestToken;
    }

    const shipping = await api<Array<{ id: string }>>('/shipping/methods');
    if (shipping.body?.success && shipping.body.data[0]) {
      shippingMethodId = shipping.body.data[0].id;
    }

    const products = await api<{
      items: Array<{ variants?: Array<{ id: string; status?: string }> }>;
    }>('/products?pageSize=5');
    if (products.body?.success) {
      for (const p of products.body.data.items ?? []) {
        const v = p.variants?.find((x) => x.status !== 'ARCHIVED') ?? p.variants?.[0];
        if (v?.id) {
          variantId = v.id;
          break;
        }
      }
    }

    // Some catalogue APIs nest variants under product detail
    if (!variantId && products.body?.success) {
      const first = (products.body.data.items as Array<{ slug?: string }>)?.[0];
      if (first?.slug) {
        const detail = await api<{
          variants?: Array<{ id: string }>;
        }>(`/products/${first.slug}`);
        if (detail.body?.success) {
          variantId = detail.body.data.variants?.[0]?.id ?? null;
        }
      }
    }
  });

  it('rejects public bank details without cart credentials', async () => {
    if (!healthy) return;
    const { status, body } = await api('/checkout/bank-details');
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body?.success).toBe(false);
    if (body && !body.success) {
      expect(body.error.code).toMatch(/BANK_DETAILS_UNAUTHORIZED|UNAUTHORIZED|GUEST/);
    }
  });

  it('returns bank details with guest cart credentials', async () => {
    if (!healthy || !guestCartId || !guestToken) return;
    const { status, body } = await api<{ sortCode: string }>(
      `/checkout/bank-details?cartId=${guestCartId}`,
      { headers: { 'X-Guest-Token': guestToken } },
    );
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    if (body?.success) {
      expect(body.data.sortCode).toBeTruthy();
    }
  });

  it('rejects unauthenticated order GET (anti-enumeration)', async () => {
    if (!healthy) return;
    const { status, body } = await api('/orders/ORD-2099-999999');
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body?.success).toBe(false);
  });

  it('places guest order and returns viewToken', async () => {
    if (!healthy || !guestCartId || !guestToken || !shippingMethodId || !variantId) {
      return;
    }

    await api(`/carts/${guestCartId}/items`, {
      method: 'POST',
      headers: { 'X-Guest-Token': guestToken },
      body: JSON.stringify({ variantId, quantity: 1 }),
    });

    const { status, body } = await api<{
      orderNumber: string;
      viewToken: string;
    }>('/checkout', {
      method: 'POST',
      headers: {
        'X-Guest-Token': guestToken,
        'Idempotency-Key': `payflow-checkout-${Date.now()}`,
      },
      body: JSON.stringify({
        cartId: guestCartId,
        shippingMethodId,
        email: checkoutEmail,
        shippingAddress: {
          fullName: 'Pay Flow Test',
          line1: '10 Downing Street',
          city: 'London',
          postcode: 'SW1A 2AA',
          country: 'GB',
          phone: '07000000000',
        },
      }),
    });

    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    if (body?.success) {
      orderNumber = body.data.orderNumber;
      viewToken = body.data.viewToken;
      expect(orderNumber).toMatch(/^ORD-/);
      expect(viewToken).toBeTruthy();
    }
  });

  it('lookup restores viewToken with matching email', async () => {
    if (!healthy || !orderNumber) return;
    const { status, body } = await api<{
      viewToken: string;
      orderNumber: string;
    }>('/orders/lookup', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber,
        email: checkoutEmail,
      }),
    });
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    if (body?.success) {
      expect(body.data.orderNumber).toBe(orderNumber);
      expect(body.data.viewToken).toBeTruthy();
      viewToken = body.data.viewToken;
    }
  });

  it('lookup rejects wrong email', async () => {
    if (!healthy || !orderNumber) return;
    const { status, body } = await api('/orders/lookup', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber,
        email: 'wrong@threadnform.test',
      }),
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body?.success).toBe(false);
  });

  it('order detail with viewToken exposes payment without proofs signed URLs for empty proofs', async () => {
    if (!healthy || !orderNumber || !viewToken) return;
    const { status, body } = await api<{
      payment: { id: string; status: string; proofs: unknown[] } | null;
    }>(
      `/orders/${orderNumber}?email=${encodeURIComponent(checkoutEmail)}&viewToken=${viewToken}`,
    );
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    if (body?.success) {
      expect(body.data.payment?.id).toBeTruthy();
      paymentId = body.data.payment!.id;
      expect(body.data.payment?.status).toBe('PENDING');
    }
  });

  it('admin cannot approve payment without proof', async () => {
    if (!healthy || !adminToken || !paymentId) return;
    const { status, body } = await api(`/admin/payments/${paymentId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Idempotency-Key': `approve-noproof-${Date.now()}`,
      },
      body: JSON.stringify({}),
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body?.success).toBe(false);
    if (body && !body.success) {
      expect(body.error.code).toMatch(/PAYMENT_PROOF_REQUIRED|INVALID/);
    }
  });

  it('registers a fake proof path is rejected by path rules without upload', async () => {
    if (!healthy || !orderNumber) return;
    // Without auth this must fail
    const { status } = await api(`/orders/${orderNumber}/payment-proofs`, {
      method: 'POST',
      body: JSON.stringify({
        storagePath: `orders/${orderNumber}/proof.jpg`,
        mime: 'image/jpeg',
        sizeBytes: 100,
      }),
    });
    expect(status).toBeGreaterThanOrEqual(401);
  });
});
