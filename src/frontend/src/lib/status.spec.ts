import { describe, expect, it } from "vitest";
import {
  activeMeta,
  customerStatusMeta,
  productStatusMeta,
  publishMeta,
  stockMeta,
  shippingStatusMeta,
} from "./status";

describe("status meta", () => {
  it("maps product lifecycle states", () => {
    expect(productStatusMeta("ACTIVE")).toMatchObject({
      label: "Active",
      tone: "success",
    });
    expect(productStatusMeta("DRAFT").tone).toBe("neutral");
    expect(productStatusMeta("UNKNOWN").label).toBe("Unknown");
  });

  it("maps customer and publish helpers", () => {
    expect(customerStatusMeta("BLOCKED").tone).toBe("danger");
    expect(publishMeta(true).label).toBe("Published");
    expect(publishMeta(false).label).toBe("Hidden");
    expect(activeMeta(false).label).toBe("Inactive");
  });

  it("grades stock levels", () => {
    expect(stockMeta(null).label).toBe("Not tracked");
    expect(stockMeta(0).tone).toBe("danger");
    expect(stockMeta(3).tone).toBe("warning");
    expect(stockMeta(12).tone).toBe("success");
  });

  it("maps shipping states", () => {
    expect(shippingStatusMeta("PARTIALLY_SHIPPED").label).toBe(
      "Partly shipped",
    );
    expect(shippingStatusMeta("SHIPPED").tone).toBe("success");
  });
});
