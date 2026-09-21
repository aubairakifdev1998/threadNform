# Fareya Backend — Architecture & Development Specification

**Status:** Design approved for incremental implementation  
**Stack:** NestJS modular monolith · Clean Architecture · Supabase (Auth, Postgres, Storage)  
**Market:** United Kingdom only · Currency GBP (pence) · Payment V1: Bank transfer  

Companion: [`ASSUMPTIONS.md`](./ASSUMPTIONS.md)

---

## 0. Current State Gap Analysis

Existing scaffold (`001_products_and_storage.sql`, flat `Product` entity):

| Area | Today | Required |
|------|-------|----------|
| Product | Flat name/price/stock | Department → … → Variant → SKU |
| Money | `numeric` float-style | Integer pence + snapshots |
| Inventory | `products.stock` | Warehouse + on_hand/reserved + ledger |
| Auth | Supabase users only | Customer vs Admin + RBAC |
| Cart/Checkout/Orders/Payments | Missing | Full commerce lifecycle |
| API | `/api/*` | `/api/v1/*` + error envelope |
| Error format | `{ statusCode, code, message }` | `{ success, error: { code, message, details } }` |

**Decision:** Treat current products table as disposable prototype. Phase 1 migrations introduce the commerce schema; deprecate/remove the flat products model.

---

## 1. Architecture Overview

### 1.1 Style

**Modular monolith** with clear domain modules. No microservices in V1.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Presentation (HTTP)                         │
│  Controllers · DTOs · Guards · Filters · Swagger                │
├─────────────────────────────────────────────────────────────────┤
│                     Application                                 │
│  Use cases · Commands/Queries · Transaction orchestration       │
├─────────────────────────────────────────────────────────────────┤
│                     Domain                                      │
│  Entities · Value Objects · State machines · Ports (repos)      │
├─────────────────────────────────────────────────────────────────┤
│                     Infrastructure                              │
│  Supabase Auth/DB/Storage · Config · Email port stubs           │
└─────────────────────────────────────────────────────────────────┘
```

Dependency rule (unchanged): `presentation → application → domain ← infrastructure`

### 1.2 Architecture Diagram (logical)

```
                    ┌──────────────┐     ┌──────────────┐
                    │ Admin Web    │     │ Storefront   │
                    └──────┬───────┘     └──────┬───────┘
                           │ Bearer JWT         │ Bearer / cart token
                           ▼                    ▼
                    ┌──────────────────────────────────┐
                    │     NestJS API  /api/v1/*        │
                    │  Authz (RBAC) · Validation · Idempotency
                    └───────────────┬──────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   Domain Modules            Application Use Cases        Infra Adapters
   (catalog, cart,           (checkout, reserve,          (Supabase PG,
    inventory, orders,        verify payment…)             Auth, Storage)
    payments, …)
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  Postgres (Supabase) │
                         │  + Storage buckets   │
                         └─────────────────────┘
```

### 1.3 Module Structure

```
src/
├── domain/
│   ├── shared/           # Money, UkAddress, Result, pagination types
│   ├── auth/
│   ├── catalog/          # departments, categories, attributes, brands, collections, products, variants, media
│   ├── inventory/        # warehouses, stock, movements, reservations
│   ├── customers/        # customers, addresses
│   ├── carts/
│   ├── checkout/
│   ├── orders/           # orders, items, timeline, returns
│   ├── payments/         # bank config, proofs, verification
│   ├── shipping/
│   ├── tax/              # vat rates, calculators
│   ├── notifications/    # ports
│   ├── audit/
│   └── reporting/
├── application/use-cases/<domain>/
├── infrastructure/
│   ├── config/
│   ├── supabase/
│   └── notifications/
└── presentation/
    ├── common/           # envelopes, pagination, guards, filters
    └── <domain>/         # controllers + DTOs
```

Nest feature modules mirror domains (`CatalogModule`, `InventoryModule`, …) and import shared infra.

---

## 2. Domain Model (Entity List)

### 2.1 Identity & Access

| Entity | Purpose |
|--------|---------|
| `AdminUser` | Staff profile + role (`OWNER`/`ADMIN`/`STAFF`) |
| `Customer` | Storefront account profile |
| `Permission` / role matrix | Code-defined; optional DB overrides later |

### 2.2 Catalog

| Entity | Purpose |
|--------|---------|
| `Department` | Men / Women / Unisex / Kids (configurable) |
| `Category` | Tree node under department (`parent_id`) |
| `Brand` | Optional brand |
| `Collection` | Merchandising groups; M:N with products |
| `Attribute` | Configurable attribute definition |
| `AttributeOption` | Allowed values (sizes, fits, etc.) |
| `Color` | Reusable color (name, hex, swatch) |
| `SizeSystem` / `SizeSystemValue` | Clothing / UK shoe / EU / US |
| `SizeChart` / `SizeChartRow` | Product or category charts |
| `Product` | Parent sellable definition |
| `ProductAttribute` | Attribute assigned to product + VARIANT_DEFINING \| INFORMATIONAL |
| `ProductVariant` | Sellable combination |
| `ProductVariantOption` | Attribute options that define the variant |
| `ProductPrice` | Base/sale/compare-at/cost + VAT treatment (pence) |
| `ProductMedia` | Images/videos at product or variant level |
| `VatRate` | Versioned rate definitions |

### 2.3 Inventory

| Entity | Purpose |
|--------|---------|
| `Warehouse` | Physical/logical stock location |
| `InventoryItem` | Per (warehouse, variant/SKU): on_hand, reserved |
| `InventoryMovement` | Immutable ledger entry |

### 2.4 Customers & Cart

| Entity | Purpose |
|--------|---------|
| `CustomerAddress` | Saved UK addresses |
| `Cart` | Guest or customer cart |
| `CartItem` | Variant + qty |

### 2.5 Commerce

| Entity | Purpose |
|--------|---------|
| `ShippingMethod` | Configurable UK delivery options |
| `Order` | Immutable commercial snapshot header |
| `OrderItem` | Line snapshot |
| `OrderAddress` | Shipping/billing snapshots |
| `OrderStatusHistory` | Timeline events |
| `Payment` | Payment record (separate status) |
| `PaymentBankAccount` | Customer-facing bank display config |
| `PaymentProof` | Uploaded proof + review metadata |
| `ReturnRequest` / `ReturnItem` | Returns foundation |
| `AuditLog` | Immutable admin/system audit |
| `IdempotencyRecord` | Key → response for mutating ops |
| `OrderNumberSequence` | Yearly sequence allocator |

### 2.6 Key Value Objects

- `Money` — `{ amountPence: number; currency: 'GBP' }`
- `UkAddress` — name, lines, town, county, postcodeNormalized, postcodeDisplay, country=`GB`, phone
- `Sku` — non-empty unique string
- `Slug` — URL-safe unique within scope

---

## 3. ERD (Logical)

```
auth.users ──┬── admin_users
             └── customers ── customer_addresses
                           └── carts ── cart_items ── product_variants

departments ── categories (parent_id self)
brands
collections ── product_collections ── products
vat_rates
attributes ── attribute_options
colors
size_systems ── size_system_values
size_charts ── size_chart_rows

products ── product_attributes (→ attributes)
        ├── product_prices
        ├── product_media
        └── product_variants ── product_variant_options
                             └── inventory_items ── warehouses
                             └── inventory_movements

shipping_methods

orders ── order_items (→ variant id nullable FK + snapshot cols)
      ├── order_addresses
      ├── order_status_history
      ├── payments ── payment_proofs
      └── return_requests ── return_items

payment_bank_accounts
audit_logs
idempotency_keys
```

**Integrity highlights**

- `product_variants.sku` **UNIQUE**
- Unique variant fingerprint per product (hash of sorted defining option IDs)
- `inventory_items` UNIQUE `(warehouse_id, variant_id)`
- `CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)`
- Orders/payments/movements/audits: no hard delete
- Money columns: `BIGINT` pence, `currency CHAR(3) DEFAULT 'GBP'`

---

## 4. Database Schema (Core Tables — Summary)

> Full SQL delivered incrementally in `supabase/migrations/00x_*.sql`. Column list below is the contract.

### 4.1 Catalog (excerpt)

```text
departments(id, name, slug, sort_order, is_active, created_at, updated_at)
categories(id, department_id, parent_id, name, slug, sort_order, is_active, ...)
brands(id, name, slug, logo_path, description, status, ...)
collections(id, name, slug, status, ...)
product_collections(product_id, collection_id)

attributes(id, code, name, input_type, ...)
attribute_options(id, attribute_id, value, label, sort_order, ...)
colors(id, name, name_normalized UNIQUE, hex, swatch_path, ...)

size_systems(id, code, name, ...)
size_system_values(id, size_system_id, code, label, sort_order, ...)
size_charts(id, name, scope_type, scope_id, size_system_id, ...)
size_chart_rows(id, size_chart_id, size_label, measurements jsonb, ...)

vat_rates(id, code, name, rate_bps, is_default, effective_from, effective_to, ...)
  -- rate_bps: 2000 = 20.00%

products(id, name, slug UNIQUE, description, short_description,
  product_type, department_id, category_id, subcategory_id, brand_id,
  status, seo jsonb, archived_at, created_at, updated_at)

product_attributes(id, product_id, attribute_id,
  role: VARIANT_DEFINING|INFORMATIONAL, ...)

product_variants(id, product_id, sku UNIQUE, status, barcode,
  option_fingerprint, is_default, archived_at, ...)

product_variant_options(variant_id, attribute_id, option_id|color_id|size_value_id)

product_prices(id, product_id, variant_id NULLABLE,
  currency, base_price_pence, sale_price_pence, compare_at_pence, cost_pence,
  vat_rate_id, vat_inclusive BOOLEAN DEFAULT true, ...)

product_media(id, product_id, variant_id NULLABLE, type IMAGE|VIDEO,
  storage_path, alt_text, sort_order, is_primary, metadata jsonb, ...)
```

### 4.2 Inventory

```text
warehouses(id, code, name, is_active, is_default, address jsonb, ...)
inventory_items(id, warehouse_id, variant_id, on_hand, reserved, updated_at)
inventory_movements(id, warehouse_id, variant_id, quantity_delta,
  movement_type, reference_type, reference_id,
  previous_on_hand, new_on_hand, previous_reserved, new_reserved,
  actor_type, actor_id, reason, created_at)
```

### 4.3 Cart / Order / Payment

```text
carts(id, customer_id NULL, guest_token_hash NULL, status, currency, ...)
cart_items(id, cart_id, variant_id, quantity, ...)

shipping_methods(id, code, name, description, price_pence, vat_rate_id,
  eta_min_days, eta_max_days, is_active, eligible_countries text[] DEFAULT '{GB}')

orders(id, order_number UNIQUE, customer_id NULL, email, phone,
  status, payment_status, currency,
  subtotal_pence, discount_pence, net_pence, vat_pence, shipping_pence, grand_total_pence,
  shipping_method_snapshot jsonb, vat_snapshot jsonb,
  idempotency_key UNIQUE NULL, placed_at, ...)

order_items(id, order_id, variant_id NULL, product_id NULL,
  product_name, sku, variant_label, attributes_snapshot jsonb,
  unit_gross_pence, quantity, discount_pence,
  vat_rate_bps, vat_pence, net_pence, line_gross_pence, ...)

order_addresses(id, order_id, type SHIPPING|BILLING, ...uk address fields snapshot...)
order_status_history(id, order_id, from_status, to_status, actor..., note, visibility CUSTOMER|ADMIN|INTERNAL, created_at)

payments(id, order_id, method BANK_TRANSFER, status, amount_due_pence, amount_claimed_pence,
  currency, bank_account_snapshot jsonb, ...)

payment_proofs(id, payment_id, storage_path, mime, size_bytes,
  amount_claimed_pence, customer_reference, customer_note, status,
  reviewed_by, reviewed_at, rejection_reason, ...)

payment_bank_accounts(id, bank_name, account_name, sort_code, account_number,
  iban, reference_instructions, is_active, ...)

return_requests / return_items (phase 7)
audit_logs(id, actor..., action, entity_type, entity_id, before jsonb, after jsonb, ip, ua, created_at)
idempotency_keys(key, scope, request_hash, response_body, status_code, created_at, expires_at)
```

### 4.4 Index Strategy

| Index | Why |
|-------|-----|
| `products(status, category_id)`, `products USING gin(to_tsvector(...))` later | Storefront/admin search |
| `product_variants(sku)` UNIQUE | SKU integrity |
| `product_variants(product_id, option_fingerprint)` UNIQUE | No duplicate combos |
| `inventory_items(warehouse_id, variant_id)` UNIQUE | Stock row |
| `inventory_movements(variant_id, created_at DESC)` | Ledger queries |
| `orders(order_number)` UNIQUE, `(status)`, `(payment_status)`, `(customer_id)`, `(placed_at DESC)` | Ops search |
| `orders(email)`, `(phone)` | Support lookup |
| `carts(customer_id)` WHERE active, `guest_token_hash` UNIQUE | Cart lookup |
| `payments(order_id)`, `payment_proofs(payment_id, status)` | Verification queue |
| `audit_logs(entity_type, entity_id, created_at DESC)` | Audit trail |
| `idempotency_keys(key, scope)` UNIQUE | Dedup |

---

## 5. State Machines

### 5.1 Order Status

```
PENDING_PAYMENT
    → PAYMENT_SUBMITTED          (proof uploaded)
    → CANCELLED                  (timeout / customer / admin / OOS before confirm)

PAYMENT_SUBMITTED
    → PAYMENT_UNDER_REVIEW
    → CANCELLED

PAYMENT_UNDER_REVIEW
    → CONFIRMED                  (payment VERIFIED)
    → PAYMENT_SUBMITTED          (proof REJECTED → customer may re-upload)
    → CANCELLED

CONFIRMED → PROCESSING → PACKED → SHIPPED → DELIVERED

Any pre-SHIPPED (except already CANCELLED):
    → CANCELLED                  (rules-dependent)

DELIVERED → RETURN_REQUESTED → RETURNED → REFUNDED
SHIPPED → RETURN_REQUESTED …    (not CANCELLED)
```

**Invalid examples:** `DELIVERED → CANCELLED`, `SHIPPED → PENDING_PAYMENT`, skip `PACKED` only if explicit admin “fast-track” permission (V1: **no skips**).

### 5.2 Payment Status (separate)

```
PENDING
  → PROOF_SUBMITTED
  → REFUND_PENDING / REFUNDED    (rare early paths)
  → (order cancelled: remains PENDING or terminal CANCELLED_ORDER marker via order status)

PROOF_SUBMITTED → UNDER_REVIEW
UNDER_REVIEW → VERIFIED | REJECTED
REJECTED → PROOF_SUBMITTED       (new proof)
VERIFIED → REFUND_PENDING → REFUNDED
```

Approval effects (single transaction):

1. Assert payment `UNDER_REVIEW` (row lock)
2. Set payment `VERIFIED`
3. Transition order `PAYMENT_UNDER_REVIEW|PAYMENT_SUBMITTED → CONFIRMED`
4. Audit + timeline
5. Idempotency short-circuit if already VERIFIED

### 5.3 Inventory Lifecycle

```
INITIAL_STOCK / PURCHASE / MANUAL_ADJUSTMENT / RETURN / TRANSFER_IN
    → increase on_hand

ORDER_RESERVATION
    → reserved += qty   (requires available >= qty)

ORDER_RELEASE
    → reserved -= qty   (cancel before fulfill)

ORDER_FULFILLMENT
    → on_hand -= qty; reserved -= qty

DAMAGE / LOSS / TRANSFER_OUT
    → decrease on_hand (if reserved conflict → reject or force adjust per policy)
```

No silent updates: every change = movement row.

### 5.4 Product Status Purchasability

| Status | Storefront visible | Purchasable |
|--------|--------------------|-------------|
| DRAFT | No | No |
| ACTIVE | Yes | Yes (if variant active + stock) |
| INACTIVE | No | No |
| ARCHIVED | No | No (historical orders keep snapshot) |

---

## 6. Checkout Sequence

```
1. Client POST /api/v1/checkout
   Headers: Idempotency-Key, Auth or cart token
   Body: shippingMethodId, shippingAddress, billingAddress?, customerNote?

2. Begin DB transaction
3. Load cart + lock inventory rows FOR UPDATE for all variants
4. Revalidate each line:
   - product/variant ACTIVE
   - price current (use server price, not cart stale)
   - available >= qty
   - UK address valid
   - shipping method active + GB eligible
5. Calculate:
   - line gross (sale or base)
   - extract VAT from inclusive price using vat_rate_bps
   - shipping + VAT treatment
   - grand total
6. Allocate order_number
7. Insert order + items + address snapshots + payment (PENDING)
8. Reserve stock (ORDER_RESERVATION movements)
9. Clear/convert cart
10. Commit
11. Emit notification OrderCreated (async; failure logged only)
12. Return order + bank details snapshot
```

**Failure:** full rollback — no partial reservation.

**Concurrency:** two checkouts on last unit → one succeeds, other `INSUFFICIENT_STOCK`.

---

## 7. VAT Calculation Approach

Given VAT-inclusive gross `G` (pence) and rate `r` where `r = rate_bps / 10000` (e.g. 0.20):

```
net = round_half_up(G / (1 + r))
vat = G - net
```

Per line; order totals = sums of line nets/vats + shipping components.

Snapshot on order:

```json
{
  "lines": [{ "sku": "...", "gross": 2400, "net": 2000, "vat": 400, "rate_bps": 2000 }],
  "shipping": { "gross": 399, "net": 333, "vat": 66, "rate_bps": 2000 },
  "totals": { "net": ..., "vat": ..., "gross": ... }
}
```

Never recompute historical orders with current `vat_rates`.

---

## 8. Shipping Model

- `shipping_methods` rows (Standard, Express seeded)
- Price in pence; ETA range; `eligible_countries = ['GB']`
- At checkout, snapshot `{ id, code, name, price_pence, eta }` onto order
- Shipping status on order (or `shipments` table phase 7): `NOT_SHIPPED → READY_TO_SHIP → SHIPPED → DELIVERED`
- Optional `carrier`, `tracking_number`, `tracking_url`

---

## 9. Authentication Model

| Actor | Auth | Profile table |
|-------|------|---------------|
| Customer | Supabase email/password | `customers` |
| Admin | Supabase email/password (invite/seed only) | `admin_users` |
| Guest | None | `carts.guest_token` |

Guards:

- `SupabaseAuthGuard` — valid JWT
- `RolesGuard` — OWNER/ADMIN/STAFF permissions
- `CustomerOwnershipGuard` — resource belongs to `customer_id`
- Public routes: catalog read, health, guest cart

---

## 10. RBAC Matrix

| Permission | OWNER | ADMIN | STAFF |
|------------|:-----:|:-----:|:-----:|
| Manage admins / bank config | ✓ | | |
| Catalog CRUD | ✓ | ✓ | read |
| Price / cost edit | ✓ | ✓ | |
| Inventory adjust | ✓ | ✓ | ✓ (limited) |
| View orders | ✓ | ✓ | ✓ |
| Change order status (ops) | ✓ | ✓ | ✓ |
| Verify/reject payment | ✓ | ✓ | |
| Cancel order | ✓ | ✓ | limited |
| Customers block | ✓ | ✓ | |
| Audit logs | ✓ | ✓ | |
| Reporting | ✓ | ✓ | limited |
| Returns approve | ✓ | ✓ | |

STAFF = pick/pack/ship oriented. Exact permission codes live in `domain/auth/permissions.ts`.

---

## 11. API Endpoint List (`/api/v1`)

### Auth
- `POST /auth/sign-up` (customer)
- `POST /auth/sign-in`
- `POST /auth/refresh`
- `POST /auth/sign-out`
- `GET  /auth/me`

### Catalog (public read / admin write)
- `GET/POST /departments` · `PATCH/DELETE /departments/:id`
- `GET/POST /categories` · `PATCH /categories/:id`
- `GET/POST /attributes` · options nested
- `GET/POST /brands` · `PATCH /brands/:id`
- `GET/POST /collections` · product membership
- `GET /products` (filters, facets) · `GET /products/:slug`
- `POST/PATCH /admin/products` · variants · media · prices
- `GET /admin/products` (admin search)

### Inventory
- `GET/POST /admin/warehouses`
- `GET /admin/inventory`
- `POST /admin/inventory/adjust`
- `GET /admin/inventory/movements`

### Customers & Addresses
- `GET/PATCH /customers/me`
- `CRUD /customers/me/addresses`

### Carts
- `POST /carts` (create guest)
- `GET /carts/current`
- `POST /carts/items` · `PATCH/DELETE /carts/items/:id`
- `POST /carts/merge` (on login)

### Checkout & Orders
- `POST /checkout` (Idempotency-Key)
- `GET /orders` (customer) · `GET /orders/:orderNumber`
- `GET /admin/orders` · `PATCH /admin/orders/:id/status`
- `POST /orders/:id/cancel`

### Payments
- `GET /checkout/bank-details` or included in checkout response
- `POST /orders/:orderNumber/payment-proofs`
- `GET /admin/payments/queue`
- `POST /admin/payments/:id/approve` (Idempotency-Key)
- `POST /admin/payments/:id/reject`

### Shipping
- `GET /shipping/methods`
- `CRUD /admin/shipping/methods`

### Audit / Reporting / Dashboard
- `GET /admin/audit`
- `GET /admin/reports/*`
- `GET /admin/dashboard`

### Storage
- `POST /storage/upload` (scoped buckets)
- `GET /storage/url`

### Health
- `GET /health`

---

## 12. API Request/Response Examples

### Error envelope

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 2 units are available for SKU TSH-BLK-M.",
    "details": { "sku": "TSH-BLK-M", "available": 2, "requested": 5 }
  }
}
```

### Success envelope

```json
{
  "success": true,
  "data": { }
}
```

### Checkout

```http
POST /api/v1/checkout
Idempotency-Key: 8f3c2a1b-...
Authorization: Bearer ...
```

```json
{
  "shippingMethodId": "uuid",
  "shippingAddress": {
    "fullName": "Jane Smith",
    "line1": "10 Downing Street",
    "line2": null,
    "city": "London",
    "county": "Greater London",
    "postcode": "SW1A 2AA",
    "country": "GB",
    "phone": "+447700900123"
  }
}
```

```json
{
  "success": true,
  "data": {
    "orderNumber": "ORD-2026-000001",
    "status": "PENDING_PAYMENT",
    "paymentStatus": "PENDING",
    "totals": {
      "subtotalPence": 4999,
      "shippingPence": 399,
      "vatPence": 900,
      "netPence": 4498,
      "grandTotalPence": 5398,
      "currency": "GBP"
    },
    "bankAccount": {
      "bankName": "Example Bank",
      "accountName": "Fareya Ltd",
      "sortCode": "00-00-00",
      "accountNumber": "12345678",
      "referenceInstructions": "Use order number as payment reference"
    }
  }
}
```

### Public product (cost omitted)

```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "Premium Cotton T-Shirt",
    "slug": "premium-cotton-t-shirt",
    "type": "VARIABLE",
    "price": { "basePence": 2499, "salePence": 1999, "currency": "GBP", "vatInclusive": true },
    "variants": [
      { "id": "...", "sku": "TSH-BLK-M", "options": { "Color": "Black", "Size": "M" }, "available": 12 }
    ]
  }
}
```

---

## 13. Error Codes (initial set)

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Input invalid |
| `UNSUPPORTED_COUNTRY` | 400 | Non-GB address |
| `INVALID_POSTCODE` | 400 | UK postcode format |
| `INVALID_PHONE` | 400 | UK phone |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | RBAC / ownership |
| `NOT_FOUND` | 404 | Resource missing |
| `PRODUCT_NOT_PURCHASABLE` | 409 | Draft/inactive/archived |
| `VARIANT_UNAVAILABLE` | 409 | Variant inactive |
| `INSUFFICIENT_STOCK` | 409 | Not enough available |
| `PRICE_CHANGED` | 409 | Optional warn/force refresh |
| `CART_INVALID` | 409 | Stale/invalid lines |
| `DUPLICATE_SKU` | 409 | SKU unique violation |
| `DUPLICATE_VARIANT` | 409 | Option combo exists |
| `INVALID_ORDER_TRANSITION` | 409 | State machine |
| `INVALID_PAYMENT_TRANSITION` | 409 | State machine |
| `PAYMENT_ALREADY_VERIFIED` | 409 | Idempotent conflict |
| `ORDER_NOT_CANCELLABLE` | 409 | e.g. already shipped |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different body |
| `PAYLOAD_TOO_LARGE` | 413 | Upload size |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | MIME |
| `RATE_LIMITED` | 429 | Throttle |
| `INTERNAL_ERROR` | 500 | Unexpected (no stack to client) |
| `CONFLICT` | 409 | Generic conflict |

---

## 14. File Storage Strategy

| Bucket | Public | Contents | Access |
|--------|--------|----------|--------|
| `products` | Yes (or CDN) | Product images/videos | Public read; admin write |
| `payment-proofs` | No | Proof files | Signed URL; owner customer or admin with permission |

`StorageService` port: `upload`, `delete`, `getPublicUrl`, `getSignedUrl`.

Upload validation: extension + MIME sniff + size. Store path in DB only after successful upload; if DB txn fails after upload, mark orphan for GC job (edge case #33).

---

## 15. Testing Strategy

| Layer | Tooling | Focus |
|-------|---------|-------|
| Unit | Vitest | Money/VAT, state machines, postcode/phone, merge cart |
| Integration | Vitest + test DB | Repositories, constraints, movements |
| API | Supertest | Authz, envelopes, checkout happy path |
| Concurrency | Parallel checkout scripts / pg tests | Last-unit race |
| E2E commerce | Vitest e2e | Place order → proof → approve → ship |

**P0 tests:** checkout, reservation, release, order create, payment verify, transitions, VAT, authz, concurrent checkout, SKU uniqueness.

---

## 16. Edge-Case Strategy (mapped)

| # | Case | Strategy |
|---|------|----------|
| 1–2 | Simple / many variants | Unified variant model; simple auto-creates default variant |
| 3–4 | Dup SKU / combo | DB unique + ConflictException |
| 5 | Archive w/ orders | Soft archive; FK nullable + snapshots |
| 6 | Price change in cart | Reprice at checkout |
| 7 | VAT rate change | Snapshot only |
| 8–10 | Unavailable / last stock | Transactional lock |
| 11–13 | Double click / refresh / disconnect | Idempotency-Key |
| 14 | Guest login merge | Sum qty + revalidate |
| 15–20 | Payment proofs / double approve | Status guards + row locks + idempotency |
| 21 | Proof on cancelled | Reject transition |
| 22–23 | Cancel / after ship | Release vs return flow |
| 24 | Address change | Order snapshot immutable |
| 25–27 | Authz / cost leak | Guards + DTO allowlists |
| 28–29 | Bad/oversize file | Validation pipe |
| 30–32 | Concurrent adjust / DB fail | Transactions |
| 33 | Upload vs DB | Orphan GC |
| 34 | Notify fail | Outbox / log, no rollback |
| 35–36 | Dup order# / SKU race | DB constraints |
| 37–38 | Rounding | Integer pence + half-up |
| 39–40 | Postcode / country | Validators |
| 41–43 | Size validity | Options constrained to product attributes |
| 44–45 | Media / archived collection | Null-safe URLs; collections don't force product status |

---

## 17. Environment Variables

```bash
PORT=3000
NODE_ENV=development|production

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET_PRODUCTS=products
SUPABASE_STORAGE_BUCKET_PAYMENT_PROOFS=payment-proofs

# App
API_PREFIX=api/v1
CORS_ORIGINS=http://localhost:5173
CART_TOKEN_SECRET=          # HMAC for guest cart tokens
IDEMPOTENCY_TTL_HOURS=24
MAX_UPLOAD_BYTES=10485760
DEFAULT_CURRENCY=GBP
DEFAULT_COUNTRY=GB

# Seed / bootstrap
OWNER_EMAIL=                # optional first OWNER bootstrap
```

Secrets never committed. Extend `.env.example` in Phase 1.

---

## 18. Migration Strategy

1. Keep `001_products_and_storage.sql` as historical prototype.
2. Add `002_commerce_foundation.sql` — enums, admin/customers, audit, idempotency.
3. `003_catalog.sql` — taxonomy, attributes, products, variants, prices, media.
4. `004_inventory.sql` — warehouses, inventory, movements.
5. `005_cart_checkout_orders.sql` — carts, shipping, orders, payments.
6. `006_seed_uk_fashion.sql` — departments, sample categories, VAT 20%, warehouse, shipping methods, size systems.
7. Drop/replace legacy flat `products` once catalog lands (or rename to `products_legacy` then drop).

Apply via Supabase SQL editor or CLI. App remains runnable: feature modules behind progressive routes; health always up.

**RLS:** prefer service-role from Nest for writes; public SELECT only for active catalog tables. Do not rely on client-direct Supabase for checkout.

---

## 19. Implementation Plan (Phased)

| Phase | Scope | Runnable outcome |
|-------|-------|------------------|
| **1** | Foundation: `/api/v1`, error envelope, admin/customer profiles, RBAC guards, migrations foundation, Swagger stub | Auth + health + role-protected ping |
| **2** | Catalog full | Admin can create fashion products/variants/SKUs/media |
| **3** | Warehouses + inventory ledger + reserve primitives | Stock adjust + concurrency-safe reserve API/internal |
| **4** | Customers, addresses, carts, merge | Guest + auth cart |
| **5** | Checkout, VAT, shipping, orders | Place UK order + snapshots |
| **6** | Bank transfer, proofs, verify/reject | Admin payment queue |
| **7** | Order lifecycle, cancel, returns foundation, tracking | Ops fulfillment |
| **8** | Audit, notifications port, reporting, dashboard | Ops visibility |
| **9** | Hardening: tests P0, rate limits, upload security, perf indexes | Production-ready |

**Rule:** Do not generate hundreds of unrelated files at once. Each phase ends with working build + migration + focused tests.

---

## 20. Missing Business Rules Identified (resolved via assumptions)

1. Guest checkout allowed? → **Yes** (A, ASSUMPTIONS).
2. Reserve at cart or order? → **Order** (A24).
3. Partial payments auto-handling? → **Manual admin** (A37).
4. Auto-cancel unpaid orders? → **Not in V1** (manual/admin); document for Phase 9 job optional.
5. Multi-warehouse allocation at checkout? → **Default warehouse only** in V1.
6. Sale price vs base when both set? → **Sale if active and < base**.
7. Compare-at display only? → **Yes**, not used in totals.

---

## 21. Concurrency & Transaction Boundaries

| Operation | Boundary |
|-----------|----------|
| Checkout | Single txn: validate + order + reserve |
| Payment approve/reject | Single txn: payment + order status + audit |
| Stock adjust | Single txn: item lock + movement |
| Cancel (pre-ship) | Single txn: status + release + audit |
| Cart add | Short txn; no stock reserve |

Use `SELECT … FOR UPDATE` on `inventory_items` and `payments` rows.

---

## 22. Next Step

**Phase 1 implementation** begins only after this document is accepted (or amended). First coding slice:

1. Evolve error filter to success/error envelope  
2. Move global prefix to `api/v1`  
3. Migration `002` foundation (roles, customers, audit, idempotency)  
4. RBAC guards + admin bootstrap  
5. Keep existing auth/storage working  

Say the word to start Phase 1, or request changes to any assumption/state machine first.
