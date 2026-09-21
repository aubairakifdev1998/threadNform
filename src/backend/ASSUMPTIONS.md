# Fareya Backend — Production Assumptions

Assumptions made for V1 of the UK-only fashion e-commerce platform.  
Update this file when business decisions change.

---

## Business & Market

| ID | Assumption | Rationale |
|----|------------|-----------|
| A1 | Platform sells **only to UK addresses** (`country = GB`). | Explicit V1 scope. |
| A2 | Currency is **GBP only**; all money stored as **integer pence**. | Avoid float errors; UK-native. |
| A3 | Storefront and checkout reject non-GB shipping countries. | UK-only rule. |
| A4 | Billing address defaults to shipping address if omitted. | Common UK fashion checkout UX. |
| A5 | Kids department is configurable but **no age-gated checkout** in V1. | Out of scope unless legal requires it later. |

---

## VAT / Tax

| ID | Assumption | Rationale |
|----|------------|-----------|
| A6 | Business is **UK VAT-registered**. | Documented, not invented as law advice. Confirm with accountant. |
| A7 | Consumer catalog prices are **VAT-inclusive (gross)** by default. | Standard UK B2C fashion practice. |
| A8 | Default standard VAT rate seed = **20%** (`vat_rates` table, versioned). | Configurable; not hardcoded in order logic. |
| A9 | Reduced/zero-rated products are supported via `vat_rate_id` on product/price. | Extensibility without schema rewrite. |
| A10 | Historical orders store **snapshotted** net, VAT rate %, VAT amount, gross. | Rate changes never rewrite history. |
| A11 | VAT rounding: compute per line in pence using **half-up**; order VAT = sum of line VAT. | Deterministic, audit-friendly. |
| A12 | Shipping fees are **VAT-inclusive** at the same rate as configured on the shipping method (default standard rate). | Simple V1; can refine later. |

**Not assumed:** HMRC filing automation, Making Tax Digital exports, or multi-jurisdiction tax engines.

---

## Catalog & Fashion Domain

| ID | Assumption | Rationale |
|----|------------|-----------|
| A13 | Taxonomy is a **tree**: Department → Category → Subcategory (depth configurable, max 3 for V1 UI). | Matches fashion merchandising. |
| A14 | Gender/audience is optional via department linkage, not a mandatory product enum. | Spec requirement. |
| A15 | Product types V1: `SIMPLE`, `VARIABLE`. Simple = one implicit variant/SKU. | Avoid special-case inventory paths. |
| A16 | Every sellable unit is a **variant with a SKU**, including simple products. | Unified inventory/cart/order model. |
| A17 | Duplicate variant-defining attribute combinations on the same product are rejected. | DB unique constraint on sorted attribute-value fingerprint. |
| A18 | Colors are normalized by `lower(trim(name))` unique key; display name preserved. | Prevent Black/black/BLACK duplicates. |
| A19 | Size systems are admin-configurable; UK systems seeded for clothing & footwear. | Spec requirement. |
| A20 | Cost price is admin-only; never in public DTOs. | Security. |
| A21 | Existing scaffold `products` table (flat price/stock) is **replaced** by the commerce schema; no dual models. | Current migration is prototype-only. |

---

## Inventory

| ID | Assumption | Rationale |
|----|------------|-----------|
| A22 | V1 ships with **one warehouse** seeded (`UK Main Warehouse`); multi-warehouse ready. | Spec. |
| A23 | `available = on_hand - reserved`; both non-negative; DB check constraints. | Integrity. |
| A24 | Reservation happens at **successful order creation** (after validation), not at add-to-cart. | Prevents inventory hostage by abandoned carts. |
| A25 | Cart holds soft intent only; stock revalidated at checkout. | Spec. |
| A26 | Inventory mutations use Postgres transactions + `SELECT … FOR UPDATE` on inventory rows. | Concurrent checkout. |
| A27 | All stock changes write an **immutable** `inventory_movements` row. | Ledger. |
| A28 | Over-selling is never allowed; insufficient stock fails the whole checkout transaction. | Commerce correctness. |

---

## Cart & Checkout

| ID | Assumption | Rationale |
|----|------------|-----------|
| A29 | Guest carts identified by signed `cart_token` (UUID + HMAC or opaque server token). | No auth required. |
| A30 | On login, guest cart merges into customer cart: **sum quantities** per variant, then revalidate availability. | Clear merge rule. |
| A31 | One active cart per authenticated customer. | Simplifies multi-device sync. |
| A32 | Checkout is server-authoritative; client totals ignored. | Spec. |
| A33 | Idempotency key required on `POST /checkout` and payment approve/reject (`Idempotency-Key` header). | Double-click / retry safety. |
| A34 | Order numbers format: `ORD-{YYYY}-{seq:6}` per calendar year, allocated via DB sequence/table under lock. | Human-readable + unique. |

---

## Payments (V1)

| ID | Assumption | Rationale |
|----|------------|-----------|
| A35 | Only payment method: **BANK_TRANSFER**. | Spec V1. |
| A36 | Uploading proof ≠ payment verified. Admin must approve. | Spec. |
| A37 | Payment amount mismatch does **not** auto-verify; admin decides (underpay/overpay/wrong). | Edge cases. |
| A38 | Multiple proof uploads allowed while status ∈ {PENDING, REJECTED, PROOF_SUBMITTED}. | Retry after rejection. |
| A39 | Customer-facing bank details come from `payment_bank_accounts` (active config), not secrets vault. | Separation of display vs credentials. |
| A40 | Card/Stripe/PayPal **out of scope** for V1; architecture leaves `payment_method` extensible. | Future-proof. |

---

## Orders, Shipping, Returns

| ID | Assumption | Rationale |
|----|------------|-----------|
| A41 | Order status and payment status are **independent** fields with separate state machines. | Spec mandatory. |
| A42 | Cancellation after `SHIPPED` is blocked; must use return/refund flow. | Spec. |
| A43 | Returns foundation in V1: request + statuses; restock/refund automation can be partial. | Phase 7. |
| A44 | Shipping methods are admin-configurable; seed Standard + Express (GB). | Spec. |
| A45 | Tracking fields optional until shipment. | Spec. |

---

## Auth, Users, RBAC

| ID | Assumption | Rationale |
|----|------------|-----------|
| A46 | Auth provider remains **Supabase Auth** (email/password). Passwords never stored in app tables. | Existing stack. |
| A47 | `admin_users` / `customers` are app profiles linked to `auth.users.id`. | Clean separation of roles. |
| A48 | Roles: `OWNER`, `ADMIN`, `STAFF` with permission matrix enforced in NestJS guards. | Spec; frontend is not security. |
| A49 | API uses Bearer access tokens (Supabase JWT). Service-role client used only server-side. | Existing pattern. |
| A50 | Customers cannot register as admins via public sign-up; admin bootstrap is seeded/env. | Security. |

---

## Storage & Media

| ID | Assumption | Rationale |
|----|------------|-----------|
| A51 | Media via abstract `StorageService`; V1 adapter = **Supabase Storage**. | Existing infra. |
| A52 | Buckets: `products` (public read), `payment-proofs` (private, signed URLs). | Access control. |
| A53 | Payment proofs: images + PDF; max **10 MB**; MIME allowlist. | Spec. |
| A54 | Binary blobs never stored in Postgres. | Spec. |

---

## API & Platform

| ID | Assumption | Rationale |
|----|------------|-----------|
| A55 | Modular monolith NestJS; Clean Architecture layers retained. | Existing codebase. |
| A56 | Public API prefix: `/api/v1/...` (migrate from current `/api/...`). | Spec versioning. |
| A57 | Success envelope: `{ success: true, data }`; errors: `{ success: false, error: { code, message, details } }`. | Spec error format; evolve current filter. |
| A58 | Pagination: `page` + `pageSize` (default 20, max 100) + `total`. | Consistent. |
| A59 | OpenAPI via `@nestjs/swagger` after Phase 1 foundation. | Spec. |
| A60 | Notifications are **ports** (email/SMS later); failures must not roll back committed commerce transactions. | Spec edge case #34. |
| A61 | Postcode validation: **format + normalize** (regex + outward/inward spacing); no full PAF dataset in V1. | Spec: don’t hardcode every postcode. |
| A62 | UK phone: E.164 preferred (`+44…`); accept common national formats and normalize. | Spec. |
| A63 | Soft-delete/archive for commerce entities; hard delete forbidden for orders, payments, movements, audits. | Spec. |
| A64 | RLS: service-role for server writes; tighten public read policies for catalog only. App RBAC is primary authorization. | Nest owns business authz; Supabase RLS as defense-in-depth for direct client access if any. |

---

## What Is Explicitly Out of Scope for V1

- International shipping/currency/tax
- Real-time card payment gateways
- Marketplace / multi-vendor
- Loyalty points / gift cards (schema may reserve extension points later)
- Full WMS / pick-pack robotics
- Automated HMRC submissions
- WhatsApp/SMS providers (ports only)

---

## Open Items for Business Confirmation

1. Confirm VAT registration and whether any product lines are reduced/zero-rated.
2. Confirm reservation timeout policy (currently: reserve until cancel/fulfill; no auto-expire in V1).
3. Confirm Standard/Express prices and SLA copy.
4. Confirm bank account display fields and payment reference format (recommend order number).
5. Confirm whether guest checkout is allowed without account creation (assumed **yes**, with email on order).
