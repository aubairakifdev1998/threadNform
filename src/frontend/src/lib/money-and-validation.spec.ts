import { describe, expect, it } from "vitest";
import { formatGbp, penceToPounds, poundsToPence } from "./money";
import { checkoutSchema, signInSchema, signUpSchema, ukAddressSchema } from "./validations";

describe("formatGbp", () => {
  it("formats pence as GBP", () => {
    expect(formatGbp(0)).toMatch(/£0\.00/);
    expect(formatGbp(1099)).toMatch(/£10\.99/);
    expect(formatGbp(100)).toMatch(/£1\.00/);
  });
});

describe("pence conversion", () => {
  it("round-trips whole pounds", () => {
    expect(poundsToPence(10.99)).toBe(1099);
    expect(penceToPounds(1099)).toBe(10.99);
  });

  it("rounds floating pounds safely", () => {
    expect(poundsToPence(10.999)).toBe(1100);
  });
});

describe("auth validation edge cases", () => {
  it("rejects short password on sign-in", () => {
    const result = signInSchema.safeParse({
      email: "a@b.co",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched confirm password", () => {
    const result = signUpSchema.safeParse({
      fullName: "Aubair Akif",
      email: "a@b.co.uk",
      password: "ValidPass1",
      confirmPassword: "ValidPass2",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid sign-up", () => {
    const result = signUpSchema.safeParse({
      fullName: "Aubair Akif",
      email: "a@b.co.uk",
      password: "ValidPass1",
      confirmPassword: "ValidPass1",
    });
    expect(result.success).toBe(true);
  });
});

describe("checkout validation edge cases", () => {
  it("rejects invalid UK postcode", () => {
    const result = ukAddressSchema.safeParse({
      fullName: "Test",
      line1: "1 High St",
      city: "London",
      postcode: "INVALID",
      country: "GB",
    });
    expect(result.success).toBe(false);
  });

  it("requires shipping method uuid", () => {
    const result = checkoutSchema.safeParse({
      email: "a@b.co",
      shippingMethodId: "not-uuid",
      shippingAddress: {
        fullName: "Test",
        line1: "1 High St",
        city: "London",
        postcode: "SW1A 1AA",
        country: "GB",
      },
      billingSameAsShipping: true,
    });
    expect(result.success).toBe(false);
  });
});
