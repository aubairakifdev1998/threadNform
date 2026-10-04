"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { catalogApi, checkoutApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { loadGuestCart, notifyCartUpdated } from "@/lib/cart/guest-cart";
import { getFreshAccessToken } from "@/lib/auth/current-user";
import { guestCartStore, tokenStore } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { checkoutSchema, type CheckoutValues } from "@/lib/validations";
import { CheckoutShimmer, Spinner } from "@/components/ui/page-shimmers";
import { EmptyState } from "@/components/ui/data-states";
import { PriceDisplay } from "@/components/ui/price";
import { Section } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import type { Cart, ShippingMethod } from "@/types/api";

const STEPS = ["Information", "Shipping", "Payment"] as const;

/** Error codes meaning the cart contents must be reviewed before ordering. */
const CART_PROBLEM_CODES = new Set([
  "INSUFFICIENT_STOCK",
  "VARIANT_UNAVAILABLE",
  "PRODUCT_NOT_PURCHASABLE",
  "PRICE_MISSING",
  "CART_EMPTY",
]);

/**
 * One idempotency key per cart, kept across retries and reloads so a
 * resubmission after a lost response returns the same order instead of a
 * duplicate. Dropped once the order is confirmed.
 */
function checkoutKeyFor(cartId: string): string {
  const storageKey = `checkout-key:${cartId}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    return `checkout-${cartId}`;
  }
}

function clearCheckoutKey(cartId: string) {
  try {
    sessionStorage.removeItem(`checkout-key:${cartId}`);
  } catch {
    // storage unavailable
  }
}

type CheckoutResult = {
  orderNumber: string;
  totals?: { grandTotalPence?: number };
  bankAccount?: Record<string, unknown> | null;
};

export function CheckoutExperience() {
  const router = useRouter();
  const [step, setStep] = useState<(typeof STEPS)[number]>("Information");
  const [cart, setCart] = useState<Cart | null>(null);
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  // State updates are async; a ref blocks a second click in the same tick.
  const submittingRef = useRef(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [bankDetails, setBankDetails] = useState<{
    bankName: string;
    accountName: string;
    sortCode: string;
    accountNumber: string;
    referenceInstructions: string;
  } | null>(null);

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema) as never,
    defaultValues: {
      email: "",
      phone: "",
      customerNote: "",
      shippingMethodId: "",
      billingSameAsShipping: true,
      shippingAddress: {
        fullName: "",
        line1: "",
        line2: "",
        city: "",
        county: "",
        postcode: "",
        country: "GB",
        phone: "",
      },
    },
  });

  const shippingMethodId = form.watch("shippingMethodId");
  const stepIndex = useMemo(() => STEPS.indexOf(step), [step]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bag, shipping, bank] = await Promise.all([
          loadGuestCart(),
          catalogApi.listShippingMethods(),
          checkoutApi
            .getBankDetails({
              accessToken: tokenStore.getAccessToken(),
              cartId: guestCartStore.getCartId(),
              guestToken: guestCartStore.getGuestToken(),
            })
            .catch(() => null),
        ]);
        if (cancelled) return;
        setCart(bag);
        setMethods(shipping);
        setBankDetails(bank);
        if (shipping[0] && !form.getValues("shippingMethodId")) {
          form.setValue("shippingMethodId", shipping[0].id);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Unable to load checkout",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form]);

  const selectedShipping = methods.find((m) => m.id === shippingMethodId);
  const itemCount = cart?.items?.length ?? 0;
  const subtotal = cart?.subtotalPence ?? null;
  const orderTotal =
    subtotal != null && selectedShipping
      ? subtotal + selectedShipping.pricePence
      : null;

  async function goToShipping() {
    const ok = await form.trigger(["email", "shippingAddress"]);
    if (ok) setStep("Shipping");
  }

  async function goToPayment() {
    const infoOk = await form.trigger(["email", "shippingAddress"]);
    if (!infoOk) {
      setStep("Information");
      return;
    }
    const ok = await form.trigger(["shippingMethodId"]);
    if (ok) setStep("Payment");
    else setStep("Shipping");
  }

  async function reloadCart() {
    const bag = await loadGuestCart().catch(() => null);
    setCart(bag);
    return bag;
  }

  async function placeOrder() {
    if (submittingRef.current) return;
    const cartId = guestCartStore.getCartId();
    const guestToken = guestCartStore.getGuestToken();
    if (!cartId || !guestToken || !cart || cart.items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    if (cart.hasUnavailableItems) {
      toast.error(
        "Some items are no longer available. Please review your cart.",
      );
      router.push("/cart");
      return;
    }
    if (!(await form.trigger())) {
      const errors = form.formState.errors;
      setStep(errors.shippingMethodId ? "Shipping" : "Information");
      toast.error("Please check your details");
      return;
    }

    submittingRef.current = true;
    setPlacing(true);
    const values = form.getValues();
    try {
      const accessToken = await getFreshAccessToken();
      const idempotencyKey = checkoutKeyFor(cartId);

      const body = {
        cartId,
        shippingMethodId: values.shippingMethodId,
        email: values.email,
        phone: values.phone || values.shippingAddress.phone || undefined,
        customerNote: values.customerNote || undefined,
        shippingAddress: {
          ...values.shippingAddress,
          country: "GB",
        },
        expectedTotalPence: orderTotal ?? undefined,
      };

      const placed = accessToken
        ? await checkoutApi.authenticated(body, {
            accessToken,
            idempotencyKey,
            guestToken,
          })
        : await checkoutApi.guest(body, { guestToken, idempotencyKey });

      clearCheckoutKey(cartId);
      guestCartStore.clear();
      notifyCartUpdated(null);
      setResult(placed as CheckoutResult);
      if (typeof window !== "undefined" && placed.viewToken) {
        sessionStorage.setItem(
          `order-access:${placed.orderNumber}`,
          JSON.stringify({
            email: body.email,
            viewToken: placed.viewToken,
          }),
        );
      }
      toast.success(`Order ${placed.orderNumber} placed`);
      router.push(`/orders/${placed.orderNumber}`);
    } catch (error) {
      await handleCheckoutError(error);
    } finally {
      submittingRef.current = false;
      setPlacing(false);
    }
  }

  async function handleCheckoutError(error: unknown) {
    if (!(error instanceof ApiError)) {
      toast.error("Unable to place order. Please try again.");
      return;
    }
    if (error.code === "PRICE_CHANGED") {
      await reloadCart();
      toast.error(error.message, { duration: 8000 });
      return;
    }
    if (CART_PROBLEM_CODES.has(error.code)) {
      await reloadCart();
      toast.error(error.message, { duration: 8000 });
      router.push("/cart");
      return;
    }
    if (
      error.code === "CART_ALREADY_CHECKED_OUT" ||
      error.code === "NOT_FOUND"
    ) {
      // Ordered from another tab, or the cart expired: start fresh.
      guestCartStore.clear();
      notifyCartUpdated(null);
      toast.error(
        "This cart has already been ordered. Check your email or account for the order.",
        { duration: 8000 },
      );
      router.push("/cart");
      return;
    }
    if (
      [
        "PHONE_REQUIRED",
        "INVALID_PHONE",
        "INVALID_POSTCODE",
        "UNSUPPORTED_COUNTRY",
        "VALIDATION_ERROR",
      ].includes(error.code)
    ) {
      setStep("Information");
    }
    if (error.code === "SHIPPING_METHOD_UNAVAILABLE") {
      setStep("Shipping");
      catalogApi
        .listShippingMethods()
        .then(setMethods)
        .catch(() => undefined);
    }
    toast.error(error.message);
  }

  if (loading) {
    return <CheckoutShimmer />;
  }

  if (!cart || itemCount === 0) {
    return (
      <Section width="narrow" space="loose">
        <h1 className="heading-display text-4xl">Checkout</h1>
        <EmptyState
          icon={ShoppingBag}
          title="Your bag is empty"
          description="Add pieces from the shop before checking out."
          action={
            <Link href="/shop" className={cn(buttonVariants())}>
              Continue shopping
            </Link>
          }
          className="mt-6 border border-dashed border-border"
        />
      </Section>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16 lg:px-8 lg:py-14">
      <div>
        <Link
          href="/cart"
          className="inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground transition hover:bg-secondary"
          aria-label="Back to bag"
        >
          <ArrowLeft className="size-4" />
        </Link>

        <h1 className="heading-display mt-8 text-4xl sm:text-5xl">Checkout</h1>

        <nav
          className="mt-8 flex gap-6 border-b border-border"
          aria-label="Checkout steps"
        >
          {STEPS.map((item, index) => {
            const reachable = index <= stepIndex;
            return (
            <button
              key={item}
              type="button"
              onClick={() => {
                if (index < stepIndex) setStep(item);
                else if (index === stepIndex) return;
                else if (item === "Shipping") void goToShipping();
                else if (item === "Payment") void goToPayment();
              }}
              className={cn(
                "pb-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] transition",
                step === item
                  ? "border-b-2 border-foreground text-foreground"
                  : reachable
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/60",
              )}
            >
              {item}
            </button>
            );
          })}
        </nav>

        {step === "Information" ? (
          <div className="mt-10 space-y-8">
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
                Contact
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...form.register("email")} />
                  {form.formState.errors.email ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.email.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" {...form.register("phone")} />
                  {form.formState.errors.phone ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.phone.message}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
                Shipping address
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    {...form.register("shippingAddress.fullName")}
                    aria-invalid={Boolean(form.formState.errors.shippingAddress?.fullName)}
                  />
                  {form.formState.errors.shippingAddress?.fullName ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.shippingAddress.fullName.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="line1">Address line 1</Label>
                  <Input
                    id="line1"
                    {...form.register("shippingAddress.line1")}
                    aria-invalid={Boolean(form.formState.errors.shippingAddress?.line1)}
                  />
                  {form.formState.errors.shippingAddress?.line1 ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.shippingAddress.line1.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="line2">Address line 2</Label>
                  <Input
                    id="line2"
                    {...form.register("shippingAddress.line2")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    {...form.register("shippingAddress.city")}
                    aria-invalid={Boolean(form.formState.errors.shippingAddress?.city)}
                  />
                  {form.formState.errors.shippingAddress?.city ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.shippingAddress.city.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postcode">Postcode</Label>
                  <Input
                    id="postcode"
                    {...form.register("shippingAddress.postcode")}
                    aria-invalid={Boolean(form.formState.errors.shippingAddress?.postcode)}
                  />
                  {form.formState.errors.shippingAddress?.postcode ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.shippingAddress.postcode.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="county">County</Label>
                  <Input
                    id="county"
                    {...form.register("shippingAddress.county")}
                  />
                </div>
              </div>
            </section>

            <Button type="button" onClick={() => void goToShipping()}>
              Shipping
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : null}

        {step === "Shipping" ? (
          <div className="mt-10 space-y-6">
            <p className="text-sm text-muted-foreground">
              UK delivery only. Choose how you want the order sent.
            </p>
            {methods.length === 0 ? (
              <p className="text-sm text-destructive">
                No delivery methods are available right now. Please try again
                later.
              </p>
            ) : null}
            <div className="space-y-3">
              {methods.map((method) => (
                <label
                  key={method.id}
                  className="flex cursor-pointer items-center justify-between border border-border bg-background px-4 py-4 text-sm transition hover:border-foreground/40"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      value={method.id}
                      checked={shippingMethodId === method.id}
                      onChange={() =>
                        form.setValue("shippingMethodId", method.id)
                      }
                      className="accent-foreground"
                    />
                    <span>
                      <span className="font-medium">{method.name}</span>
                      {method.description ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {method.description}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <PriceDisplay
                    pence={method.pricePence}
                    size="sm"
                    className="text-muted-foreground"
                  />
                </label>
              ))}
            </div>
            <Button type="button" onClick={() => void goToPayment()}>
              Payment
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : null}

        {step === "Payment" ? (
          <div className="mt-10 space-y-6">
            <p className="text-sm text-muted-foreground">
              Place the order, then transfer the amount using the bank details
              below. Upload proof from your order page.
            </p>
            <div className="space-y-3 border border-border bg-secondary/40 p-5 text-sm">
              <p className="font-medium">Bank transfer</p>
              {bankDetails ? (
                <p className="leading-relaxed text-muted-foreground">
                  Account name: {bankDetails.accountName}
                  <br />
                  Bank: {bankDetails.bankName}
                  <br />
                  Sort code: {bankDetails.sortCode} · Account:{" "}
                  {bankDetails.accountNumber}
                  <br />
                  {bankDetails.referenceInstructions}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Bank details will appear on your order page after you place
                  the order. If checkout fails, ask the store to configure a
                  bank account.
                </p>
              )}
            </div>
            {orderTotal != null ? (
              <p className="text-sm">
                Amount to transfer:{" "}
                <PriceDisplay pence={orderTotal} size="sm" className="font-semibold" />
              </p>
            ) : null}
            <Button
              type="button"
              disabled={placing || Boolean(result) || cart.hasUnavailableItems}
              onClick={() => void placeOrder()}
              className="w-full sm:w-auto"
            >
              {placing ? (
                <Spinner label="Placing order…" className="text-background" />
              ) : (
                "Place order"
              )}
            </Button>
            {result ? (
              <p className="text-sm text-muted-foreground">
                Order {result.orderNumber} created. Redirecting to tracking…
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-8 text-xs text-muted-foreground">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
      </div>

      <aside className="h-fit border border-border bg-background p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
            Your order
          </h2>
          <span className="text-sm text-muted-foreground">({itemCount})</span>
        </div>
        <ul className="mt-6 space-y-3 text-sm">
          {cart.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span
                className={cn(
                  "text-muted-foreground",
                  item.inStock === false && "text-destructive",
                )}
              >
                {item.productName ?? item.sku ?? "Item"} × {item.quantity}
                {item.inStock === false ? " — unavailable" : ""}
              </span>
              <PriceDisplay
                pence={
                  item.lineTotalPence ?? item.unitPricePence * item.quantity
                }
                size="sm"
              />
            </li>
          ))}
        </ul>
        <div className="mt-8 space-y-2 border-t border-border pt-6 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            {subtotal != null ? (
              <PriceDisplay pence={subtotal} size="sm" />
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            {selectedShipping ? (
              <PriceDisplay pence={selectedShipping.pricePence} size="sm" />
            ) : (
              <span>Select method</span>
            )}
          </div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total</span>
            {orderTotal != null ? (
              <PriceDisplay pence={orderTotal} size="sm" className="font-semibold" />
            ) : (
              <span>—</span>
            )}
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Prices include VAT. If anything changes before you order, we will
            ask you to confirm the new total.
          </p>
        </div>
      </aside>
    </div>
  );
}
